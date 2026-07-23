const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', 'libs', 'katex', '.git', '.vscode', 'tmp', 'scripts'];
const searchPatterns = [/console\.log\(/, /TODO/i, /FIXME/i];
const results = [];

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!excludeDirs.includes(file)) {
                walk(fullPath);
            }
        } else if (file.endsWith('.js') && file !== 'audit.js' && !file.endsWith('.min.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                for (const pattern of searchPatterns) {
                    if (pattern.test(line)) {
                        results.push({ file: fullPath, line: index + 1, content: line.trim() });
                        break;
                    }
                }
            });
        }
    }
}

walk(path.join(__dirname, 'backend'));
walk(path.join(__dirname, 'frontend'));

console.log(JSON.stringify(results, null, 2));
