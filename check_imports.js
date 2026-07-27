const fs = require('fs');
const path = require('path');

function checkDir(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
        if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.git') {
            checkDir(path.join(dir, f.name));
        } else if (f.isFile() && f.name.endsWith('.js')) {
            const content = fs.readFileSync(path.join(dir, f.name), 'utf8');
            const requires = [...content.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
            for (const r of requires) {
                let reqPath = r[1];
                if (reqPath.startsWith('.')) {
                    let fullPath = path.resolve(dir, reqPath);
                    if (!fullPath.endsWith('.js')) fullPath += '.js';
                    
                    // Check if file exists exactly with this casing
                    const parentDir = path.dirname(fullPath);
                    const baseName = path.basename(fullPath);
                    if (fs.existsSync(parentDir)) {
                        const actualFiles = fs.readdirSync(parentDir);
                        if (!actualFiles.includes(baseName)) {
                            // Let's see if it matches case-insensitively
                            const lowerFiles = actualFiles.map(x => x.toLowerCase());
                            if (lowerFiles.includes(baseName.toLowerCase())) {
                                console.error(`MISMATCH: ${path.join(dir, f.name)} requires '${reqPath}' but the file is named '${actualFiles[lowerFiles.indexOf(baseName.toLowerCase())]}'`);
                            }
                        }
                    }
                }
            }
        }
    }
}

checkDir(path.join(__dirname, 'backend'));
console.log("Check complete.");
