import { spawn } from 'child_process';

console.log('Starting Gemini OCR Backend Server on http://localhost:3001 ...');
const geminiBackend = spawn('node', ['gemini-backend.js'], { stdio: 'inherit', shell: true });

console.log('Starting Email Backend Server on http://localhost:3002 ...');
const emailBackend = spawn('node', ['email-backend.js'], { stdio: 'inherit', shell: true });

console.log('Starting Vite Web Application Dev Server ...');
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

function cleanup() {
  console.log('\nStopping servers...');
  try { geminiBackend.kill(); } catch (e) {}
  try { emailBackend.kill(); } catch (e) {}
  try { vite.kill(); } catch (e) {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

