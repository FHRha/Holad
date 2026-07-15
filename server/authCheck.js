require('dotenv').config({ path: '.env' });
const query = { id: '123' };

const envUrl = process.env.NAVIDROME_URL;
const envUser = process.env.NAVIDROME_USER;
const envPass = process.env.NAVIDROME_PASS;
if (envUrl && envUser && envPass) {
  const crypto = require('crypto');
  const salt = Math.random().toString(36).substring(2, 15);
  const token = crypto.createHash('md5').update(envPass + salt).digest('hex');
  const authParams = `u=${encodeURIComponent(envUser)}&t=${token}&s=${salt}&v=${query.v||'1.16.1'}&c=${query.c||'StreamNavi'}&f=${query.f||'json'}`;
  console.log('SUCCESS:', { serverUrl: envUrl, authParams });
} else {
  console.log('FAIL: Missing env vars', { envUrl, envUser, envPass });
}
