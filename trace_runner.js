/**
 * trace_runner.js
 * 
 * Purpose: To intercept process.exit(1) on Render and synchronously print
 * the exact exception object (err.stack, err.code, etc.) before the Node.js 
 * event loop terminates and swallows the asynchronous pipe buffer.
 * 
 * Usage on Render: 
 * Go to the Render Dashboard -> Shell, and run:
 * node trace_runner.js
 */

const fs = require('fs');
const originalExit = process.exit;
const originalError = console.error;

// Ensure all console.error calls are synchronously flushed to a file
console.error = function(...args) {
  try {
    fs.appendFileSync('./trace_error.log', args.map(a => 
      typeof a === 'object' ? JSON.stringify(a, Object.getOwnPropertyNames(a), 2) : a
    ).join(' ') + '\n');
  } catch (e) {}
  originalError.apply(console, args);
};

// Intercept process.exit to print the exact stack trace of what called it
process.exit = function(code) {
  if (code === 1) {
    const msg = `\n[VERIFIABLE EVIDENCE] process.exit(1) was called!\n` +
                `Stack trace of the exit call:\n${new Error().stack}\n\n` +
                `Check trace_error.log for the exact exception object.\n`;
    
    // Print synchronously to standard out/error
    fs.writeSync(process.stdout.fd, msg);
    
    try {
      const logs = fs.readFileSync('./trace_error.log', 'utf8');
      fs.writeSync(process.stdout.fd, `\n--- LAST CAPTURED ERROR LOG ---\n${logs}\n-------------------------------\n`);
    } catch (e) {}
  }
  originalExit(code);
};

console.log('[TRACER] Starting application with exit interception...');
require('./backend/server.js');
