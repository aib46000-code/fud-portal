const http = require('http');

function get(path, label) {
  return new Promise(resolve => {
    http.get('http://localhost:5000' + path, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log('\n' + label + ' [' + res.statusCode + ']:');
        try { console.log(JSON.stringify(JSON.parse(d), null, 2)); }
        catch(e) { console.log(d); }
        resolve();
      });
    }).on('error', e => { console.log(label + ' ERROR:', e.message); resolve(); });
  });
}

async function run() {
  await get('/api/health', 'HEALTH');
  await get('/api/metrics', 'METRICS');
  console.log('\nAll endpoints responding.');
}

run();
