const fs = require('fs');

let code = fs.readFileSync('frontend/js/tests.js', 'utf8');

// 1. Update loadMyResults to include PDF download button
if (!code.includes('<i class="fas fa-file-pdf"></i> PDF')) {
  code = code.replace(
    /<button class="btn btn-xs btn-secondary" onclick="openReview\(\${r\.id}\)" title="Review answers">[\s\S]*?<i class="fas fa-eye"><\/i> Review[\s\S]*?<\/button>/g,
    `<button class="btn btn-xs btn-secondary" onclick="openReview(\${r.id})" title="Review answers">
              <i class="fas fa-eye"></i> Review
            </button>
            <a class="btn btn-xs btn-primary" href="/api/tests/\${r.test_id}/results/\${r.id}/pdf" target="_blank" title="Download Result PDF">
              <i class="fas fa-file-pdf"></i> PDF
            </a>`
  );
}

// 2. We should also update the Admin results overview table to include PDF download
if (!code.includes('admin-download-pdf')) {
  code = code.replace(
    /<td style="white-space:nowrap;display:flex;gap:.4rem">[\s\S]*?<button class="btn btn-xs btn-secondary" onclick="openReview\(\${r\.id}\)"><i class="fas fa-eye"><\/i><\/button>[\s\S]*?<\/td>/g,
    `<td style="white-space:nowrap;display:flex;gap:.4rem">
                    <button class="btn btn-xs btn-secondary" onclick="openReview(\${r.id})"><i class="fas fa-eye"></i></button>
                    <a class="btn btn-xs btn-primary admin-download-pdf" href="/api/tests/\${r.test_id}/results/\${r.id}/pdf" target="_blank" title="Download Result PDF">
                      <i class="fas fa-file-pdf"></i>
                    </a>
                 </td>`
  );
}

fs.writeFileSync('frontend/js/tests.js', code);
console.log('tests.js updated with PDF buttons successfully');
