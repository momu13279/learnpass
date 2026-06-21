const fs = require('fs');
const html = fs.readFileSync(process.env.TEMP + '/chaoxing_homework.html', 'utf-8');

// 测试 data 属性匹配
const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
let match;
let dataCount = 0;
let validCount = 0;

while ((match = liRegex.exec(html)) !== null) {
  const fullLi = match[0];
  const dataAttrMatch = fullLi.match(/data="([^"]*)"/i);
  if (dataAttrMatch) {
    dataCount++;
    const val = dataAttrMatch[1];
    if (val.includes('mooc-ans') || val.includes('taskrefId') || val.includes('courseId')) {
      validCount++;
    }
  }
}

console.log('Total li with data attr:', dataCount);
console.log('Li with valid data URL:', validCount);

// 测试完整的 parseHomeworkHTML
const vm = require('vm');
const code = fs.readFileSync('./chaoxing-api.js', 'utf-8');

// 提取 parseHomeworkHTML 函数 - 匹配到 return homeworks; 为止
const funcMatch = code.match(/function parseHomeworkHTML\(html\) \{([\s\S]*?)return homeworks;\s*\}/);
if (funcMatch) {
  console.log('Found parseHomeworkHTML function');
  const funcCode = 'function parseHomeworkHTML(html) {\n' + funcMatch[1] + 'return homeworks;\n}\nparseHomeworkHTML(html)';
  try {
    const result = vm.runInNewContext(funcCode, { 
      console, require, process, Buffer, URL, decodeURIComponent,
      html: html  // 传入 html 变量
    });
    console.log('Parse result count:', result ? result.length : 'null');
    if (result && result.length > 0) {
      console.log('First item:', JSON.stringify(result[0], null, 2));
    }
  } catch(e) {
    console.error('Parse error:', e.message);
    console.error(e.stack);
  }
} else {
  console.log('Function not found');
}