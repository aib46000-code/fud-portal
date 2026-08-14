'use strict';

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const FormData = require('form-data');
const fetchApi = globalThis.fetch; // Native fetch in Node 20

class EmailProvider {
  async send({ from, fromName, to, subject, html, text }) {
    throw new Error('Not implemented');
  }
  async verify() {
    throw new Error('Not implemented');
  }
}

class SmtpProvider extends EmailProvider {
  constructor(options = {}) {
    super();
    this.etherealAccount = null;
    this.transporter = null;
    this.options = options;
  }

  async getTransporter() {
    if (this.transporter) return this.transporter;

    let { host, port, secure, user, pass, service } = this.options;
    
    host = host || process.env.EMAIL_HOST || 'smtp.gmail.com';
    port = parseInt(port || process.env.EMAIL_PORT || '587', 10);
    secure = secure !== undefined ? secure : (process.env.EMAIL_SECURE === 'true' || port === 465);
    user = user || process.env.EMAIL_USER;
    pass = pass || process.env.EMAIL_PASS;
    service = service || process.env.EMAIL_SERVICE;

    if (user && pass) {
      const opts = {
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      };
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass
        },
        tls: {
          rejectUnauthorized: false
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      return this.transporter;
    }

    if (!this.etherealAccount) {
      try {
        this.etherealAccount = await nodemailer.createTestAccount();
        logger.info(`[Email] Ethereal test account: ${this.etherealAccount.user}`);
      } catch (err) {
        logger.error('[Email] Failed to create Ethereal account:', err.message);
        return null;
      }
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: this.etherealAccount.user, pass: this.etherealAccount.pass },
    });
    return this.transporter;
  }

  async send({ from, fromName, to, subject, html, text }) {
    const t = await this.getTransporter();
    if (!t) {
      throw new Error('No SMTP transporter available. Set EMAIL_USER and EMAIL_PASS in your environment variables.');
    }

    const fromAddress = `"${fromName}" <${from}>`;
    const info = await t.sendMail({ from: fromAddress, to, subject, html, text: text || '' });
    
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`[Email] Ethereal preview URL: ${previewUrl}`);
    }
    
    return { messageId: info.messageId, previewUrl };
  }

  async verify() {
    try {
      const t = await this.getTransporter();
      if (!t) {
        return { ok: false, error: 'No transporter — EMAIL_USER/EMAIL_PASS not set' };
      }
      await Promise.race([
        t.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP verify timeout")), 10000))
      ]);
      return {
        ok: true,
        user: this.options.user || process.env.EMAIL_USER || this.etherealAccount?.user,
        host:
          this.options.host ||
          process.env.EMAIL_HOST ||
          (this.options.user || process.env.EMAIL_USER ? 'smtp.gmail.com' : 'smtp.ethereal.email')
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

class BrevoProvider extends SmtpProvider {
  constructor() {
    super({
      host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
      port: process.env.EMAIL_PORT || 587,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    });
  }
}

class ResendProvider extends EmailProvider {
  constructor() {
    super();
    this.apiKey = process.env.RESEND_API_KEY;
  }

  async send({ from, fromName, to, subject, html, text }) {
    if (!this.apiKey) throw new Error('RESEND_API_KEY is not set');

    const fromAddress = `"${fromName}" <${from}>`;
    
    const res = await fetchApi('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
        text: text || ''
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Resend Error: ${data.message || res.statusText}`);
    }

    return { messageId: data.id, previewUrl: null };
  }

  async verify() {
    if (!this.apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
    return { ok: true, user: 'Resend API', host: 'api.resend.com' };
  }
}

class MailgunProvider extends EmailProvider {
  constructor() {
    super();
    this.apiKey = process.env.MAILGUN_API_KEY;
    this.domain = process.env.MAILGUN_DOMAIN;
  }

  async send({ from, fromName, to, subject, html, text }) {
    if (!this.apiKey || !this.domain) throw new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN is not set');

    const fromAddress = `"${fromName}" <${from}>`;
    const form = new FormData();
    form.append('from', fromAddress);
    form.append('to', to);
    form.append('subject', subject);
    form.append('html', html);
    if (text) form.append('text', text);

    const auth = Buffer.from(`api:${this.apiKey}`).toString('base64');

    const res = await fetchApi(`https://api.mailgun.net/v3/${this.domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      body: form
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Mailgun Error: ${data.message || res.statusText}`);
    }

    return { messageId: data.id, previewUrl: null };
  }

  async verify() {
    if (!this.apiKey || !this.domain) return { ok: false, error: 'MAILGUN_API_KEY/MAILGUN_DOMAIN not set' };
    return { ok: true, user: 'Mailgun API', host: `api.mailgun.net/v3/${this.domain}` };
  }
}

let activeProvider = null;

const VALID_PROVIDERS = ['smtp', 'resend', 'brevo', 'mailgun'];

function getProvider() {
  if (activeProvider) return activeProvider;

  const raw      = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase().trim();
  const provider = VALID_PROVIDERS.includes(raw) ? raw : null;

  if (!provider) {
    // Requirement 26: invalid value → warn and fall back to SMTP, never crash
    logger.warn(`[Email] Unknown EMAIL_PROVIDER "${process.env.EMAIL_PROVIDER}" — falling back to smtp`);
  }

  if (provider === 'resend') {
    activeProvider = new ResendProvider();
  } else if (provider === 'brevo') {
    activeProvider = new BrevoProvider();
  } else if (provider === 'mailgun') {
    activeProvider = new MailgunProvider();
  } else {
    activeProvider = new SmtpProvider();
  }

  // Capitalize for startup diagnostic log
  const resolvedName = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Smtp';
  logger.info(`[Email] Using ${resolvedName} provider`);

  return activeProvider;
}

module.exports = {
  getProvider
};
