const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k) envVars[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const url = envVars.VITE_SUPABASE_URL;
const key = envVars.VITE_SUPABASE_ANON_KEY;

async function run() {
  console.log('Testing RPC or profile query...');
  const res = await fetch(`${url}/rest/v1/rpc/find_user_by_email`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email_query: 'test@example.com' })
  });
  console.log('RPC Status:', res.status);
  const text = await res.text();
  console.log('RPC Output:', text);
}

run();
