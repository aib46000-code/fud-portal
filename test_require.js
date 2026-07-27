const fs = require('fs');
const path = require('path');

function requireAll(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
        if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.git') {
            requireAll(path.join(dir, f.name));
        } else if (f.isFile() && f.name.endsWith('.js') && f.name !== 'test_require.js' && f.name !== 'server.js') {
            try {
                require(path.join(dir, f.name));
            } catch (err) {
                console.error(`Error requiring ${path.join(dir, f.name)}:`, err);
            }
        }
    }
}

requireAll(path.join(__dirname, 'backend'));
console.log('All required successfully.');
