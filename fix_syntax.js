const fs = require('fs');
let code = fs.readFileSync('backend/controllers/testController.js', 'utf8');

// The file literally contains \` where it should just have `
// Let's replace instances of \` with `
code = code.replace(/\\`/g, '`');

fs.writeFileSync('backend/controllers/testController.js', code);
console.log('testController.js syntax fixed successfully');
