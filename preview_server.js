import { createServer } from 'http';
import { readFileSync } from 'fs';
const server = createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(readFileSync('./sample_report_preview.html'));
});
server.listen(5000, '0.0.0.0', () => console.log('Preview server ready on port 5000'));
