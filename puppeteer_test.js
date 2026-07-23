const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log('Navigating to index.html...');
  await page.goto('http://localhost:5000/index.html');
  
  await page.evaluate(() => {
    localStorage.setItem('fud_access', 'dummy_token');
    localStorage.setItem('fud_user', JSON.stringify({ role: 'student', email: 'test@fud.test' }));
  });

  console.log('Navigating to cbt.html?testId=12');
  await page.goto('http://localhost:5000/cbt.html?testId=12', { waitUntil: 'networkidle0' });

  console.log('Clicking Start Exam...');
  await page.click('#btn-start');
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
