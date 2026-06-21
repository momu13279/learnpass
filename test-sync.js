const fs = require('fs');
const path = require('path');

// 清除 require 缓存
delete require.cache[require.resolve('./chaoxing-api')];
const api = require('./chaoxing-api');

// 读取保存的 cookie
const dataFile = path.join(require('os').homedir(), 'AppData/Roaming/learnpass-assistant/data/app_data.json');
let cookie = '';
try {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  cookie = data.chaoxing?.cookie || '';
  console.log('Cookie length:', cookie.length);
} catch(e) {
  console.log('No saved cookie');
}

if (!cookie) {
  console.log('No cookie, cannot test');
  process.exit(1);
}

// 测试同步
async function test() {
  console.log('Testing sync...');
  const result = await api.syncAll(cookie);
  console.log('Sync result:', JSON.stringify(result, null, 2));
}

test().catch(e => console.error('Error:', e.message));