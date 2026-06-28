const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
// Use Railway volume if available, otherwise /tmp
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';
const SYNC_FILE = path.join(DATA_DIR, 'morning-sync.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function readSync() {
  try { return fs.readFileSync(SYNC_FILE, 'utf8'); } catch { return '{}'; }
}

function writeSync(data) {
  fs.writeFileSync(SYNC_FILE, data, 'utf8');
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // Sync endpoint
  if (req.url === '/sync') {
    if (req.method === 'GET') {
      const data = readSync();
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(data);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const incoming = JSON.parse(body);
          if (!incoming.lastModified) {
            res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
            return res.end('{"error":"missing lastModified"}');
          }
          // Last-write-wins
          try {
            const existing = JSON.parse(readSync());
            if (existing.lastModified && existing.lastModified > incoming.lastModified) {
              res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
              return res.end('{"status":"skipped","reason":"remote is newer"}');
            }
          } catch {}
          writeSync(body);
          res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
          res.end('{"status":"ok"}');
        } catch (e) {
          res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
          res.end(`{"error":"${e.message}"}`);
        }
      });
      return;
    }
  }

  // Static file serving
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Morning Champs server on port ${PORT}`);
});
