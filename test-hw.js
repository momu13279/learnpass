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
} catch(e) {}

if (!cookie) {
  console.log('No cookie');
  process.exit(1);
}

// 测试获取作业
async function test() {
  console.log('Testing getAllHomeworks...');
  const result = await api.getAllHomeworks(cookie);
  console.log('Success:', result.success);
  console.log('Message:', result.message);
  console.log('Homeworks count:', result.data ? result.data.length : 0);
  if (result.data && result.data.length > 0) {
    console.log('First:', JSON.stringify(result.data[0], null, 2));
  }
}

test().catch(e => console.error('Error:', e.message));