const fs = require('fs');
const path = require('path');

function optimizeHtmlFiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            optimizeHtmlFiles(fullPath);
        } else if (file.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            // Add defer to script tags that have src but no defer/async
            content = content.replace(/<script\s+src="([^"]+)"(?!\s+(?:defer|async))([^>]*)>/gi, '<script src="$1" defer$2>');
            fs.writeFileSync(fullPath, content);
        }
    }
}

optimizeHtmlFiles(path.join(__dirname, 'frontend'));
console.log('Optimized HTML script tags with defer');
