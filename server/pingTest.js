require('dotenv').config({ path: '.env' });
const envUrl = process.env.NAVIDROME_URL;
const envUser = process.env.NAVIDROME_USER;
const envPass = process.env.NAVIDROME_PASS;
const crypto = require('crypto');
const salt = Math.random().toString(36).substring(2, 15);
const token = crypto.createHash('md5').update(envPass + salt).digest('hex');
const authParams = `u=${encodeURIComponent(envUser)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
const url = `${envUrl}/rest/ping?${authParams}`;

console.log('Testing URL:', url.replace(/t=[^&]+/, 't=HIDDEN'));

fetch(url)
  .then(res => res.json())
  .then(data => console.log('Ping result:', JSON.stringify(data)))
  .catch(err => console.error('Ping failed:', err));
