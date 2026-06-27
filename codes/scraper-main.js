const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let mainWindow;
let loginWindow = null;

const DATA_DIR = path.join(app.getPath('userData'), 'chaoxing-data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
  ensureDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { cookie: '', courses: [], homeworks: [], exams: [], lastSync: null };
}

function saveData(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

let appData = loadData();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    title: '学习通数据获取工具（DOM解析版）',
    webPreferences: {
      preload: path.join(__dirname, 'scraper-preload.js'),
      nodeIntegration: false, contextIsolation: true
    }
  });
  mainWindow.loadFile('scraper.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createClient() {
  return axios.create({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': appData.cookie || '',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    maxRedirects: 5
  });
}

function openLoginWindow() {
  if (loginWindow) { loginWindow.focus(); return; }
  loginWindow = new BrowserWindow({
    width: 900, height: 700,
    title: '登录学习通',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  loginWindow.loadURL('https://passport2.chaoxing.com/login?loginType=3&newversion=true&fid=-1');
  
  loginWindow.webContents.on('did-navigate', async (event, url) => {
    if (url.includes('i.chaoxing.com') || url.includes('mooc1') || url.includes('www.chaoxing.com')) {
      const cookies = await loginWindow.webContents.session.cookies.get({ url: 'https://chaoxing.com' });
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      if (cookieStr.length > 10) {
        appData.cookie = cookieStr;
        saveData(appData);
        if (mainWindow) mainWindow.webContents.send('login-success', { loggedIn: true });
        loginWindow.close(); loginWindow = null;
      }
    }
  });
  loginWindow.on('closed', () => { loginWindow = null; });
}

// 使用 DOMParser 解析 HTML（不依赖 cheerio）
function parseHomeworks(html) {
  const homeworks = [];
  // 匹配每个包含 taskrefId 的 li
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[0];
    const content = match[1];
    
    // 检查是否包含 taskrefId
    if (!liHtml.includes('taskrefId')) continue;
    
    // 提取 data URL
    const dataMatch = liHtml.match(/data="([^"]*)"/);
    if (!dataMatch) continue;
    const dataUrl = dataMatch[1];
    
    // 提取 URL 参数
    const urlParams = {};
    try {
      const url = new URL(dataUrl.includes('http') ? dataUrl : 'https://mooc1-api.chaoxing.com' + dataUrl);
      url.searchParams.forEach((v, k) => { urlParams[k] = v; });
    } catch(e) {}
    
    // 提取标题 - 第一个 <p> 标签
    let title = '';
    const pMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      title = pMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 提取状态 - 优先从 class="status" 的 span 提取，如果没有则从 aria-hidden span 提取
    let statusText = '';
    const statusMatch = content.match(/<span[^>]*class="status"[^>]*>([\s\S]*?)<\/span>/i);
    if (statusMatch) {
      statusText = statusMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 状态关键词列表
    const statusKeywords = ['已批阅','已提交','已完成','已截止','已过期','逾期','未交','进行中','待完成','待批阅','已互评','待互评'];
    
    // 提取课程名和状态（从 aria-hidden span 中）
    let courseName = '';
    const spanRegex = /<span[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanRegex.exec(content)) !== null) {
      const text = spanMatch[1].replace(/<[^>]*>/g, '').trim();
      if (!text) continue;
      // 状态关键词检查
      if (statusKeywords.some(k => text.includes(k))) {
        if (!statusText) statusText = text;
        continue;
      }
      // 课程名（不是状态，不是剩余时间）
      if (!text.includes('剩余') && !text.startsWith('作业名称') && text.length > 1) {
        if (!courseName) courseName = text;
      }
    }
    
    // 如果还是没有课程名，从所有 span 中找
    if (!courseName) {
      const allSpanRegex = /<span[^>]*>([\s\S]*?)<\/span>/gi;
      let allSpanMatch;
      while ((allSpanMatch = allSpanRegex.exec(content)) !== null) {
        const spanHtml = allSpanMatch[0];
        if (spanHtml.includes('class="status"') || spanHtml.includes('class="fr"') || spanHtml.includes('aria-label')) continue;
        const text = allSpanMatch[1].replace(/<[^>]*>/g, '').trim();
        if (text.length > 1 && !text.includes('剩余') && !text.startsWith('作业名称')) {
          // 检查是否是状态
          if (statusKeywords.some(k => text.includes(k))) continue;
          courseName = text;
          break;
        }
      }
    }
    
    // 提取剩余时间
    let leftTime = '';
    const frMatch = content.match(/<span[^>]*class="fr"[^>]*>([\s\S]*?)<\/span>/i);
    if (frMatch) {
      leftTime = frMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 提取 aria-label
    let ariaLabel = '';
    const ariaMatch = content.match(/aria-label="([^"]*)"/);
    if (ariaMatch) {
      ariaLabel = ariaMatch[1];
    }
    
    // 如果 status 为空，从 aria-label 提取
    if (!statusText && ariaLabel) {
      const keywords = ['已批阅','已提交','已完成','已截止','已过期','逾期','未交','进行中','待完成','待批阅','已互评','待互评'];
      for (const kw of keywords) {
        if (ariaLabel.includes(kw)) { statusText = kw; break; }
      }
    }
    
    // 判断状态
    let status = 'pending';
    if (statusText) {
      if (['已批阅','已提交','已完成','待批阅','已互评'].some(k => statusText.includes(k))) status = 'completed';
      else if (statusText.includes('待互评')) status = 'peer_review';
      else if (['已截止','已过期','逾期'].some(k => statusText.includes(k))) status = 'overdue';
      else if (statusText.includes('进行中')) status = 'in_progress';
      // "未提交"需要进一步判断：如果有剩余时间则是待处理，如果没有则可能是已逾期
      else if (statusText.includes('未提交')) {
        if (!leftTime || leftTime.includes('已过期') || leftTime.includes('逾期')) {
          status = 'overdue';
        } else {
          status = 'pending';
        }
      }
    }
    
    // 如果仍 pending 且剩余时间包含"已过期"
    if (status === 'pending' && leftTime.includes('已过期')) status = 'overdue';
    
    homeworks.push({
      id: urlParams.taskrefId || '',
      courseId: urlParams.courseId || '',
      name: title || '未命名作业',
      courseName: courseName,
      status: status,
      statusText: statusText,
      leftTime: leftTime,
      ariaLabel: ariaLabel,
      url: dataUrl
    });
  }
  
  return homeworks;
}

function parseExams(html) {
  const exams = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[0];
    const content = match[1];
    
    if (!liHtml.includes('taskrefId')) continue;
    
    const dataMatch = liHtml.match(/data="([^"]*)"/);
    if (!dataMatch) continue;
    const dataUrl = dataMatch[1];
    
    const urlParams = {};
    try {
      const url = new URL(dataUrl.includes('http') ? dataUrl : 'https://mooc1-api.chaoxing.com' + dataUrl);
      url.searchParams.forEach((v, k) => { urlParams[k] = v; });
    } catch(e) {}
    
    // 提取标题 - <dt> 标签
    let title = '';
    const dtMatch = content.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
    if (dtMatch) {
      title = dtMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 提取时间 - <dd> 标签
    let timeInfo = '';
    const ddMatch = content.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
    if (ddMatch) {
      timeInfo = ddMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 提取状态
    let statusText = '';
    const stateMatch = content.match(/<span[^>]*class="ks_state"[^>]*>([\s\S]*?)<\/span>/i);
    if (stateMatch) {
      statusText = stateMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // 提取 aria-label
    let ariaLabel = '';
    const ariaMatch = content.match(/aria-label="([^"]*)"/);
    if (ariaMatch) {
      ariaLabel = ariaMatch[1];
    }
    
    if (!statusText && ariaLabel) {
      const keywords = ['已结束','已完成','待批阅','已批阅','进行中','已过期'];
      for (const kw of keywords) {
        if (ariaLabel.includes(kw)) { statusText = kw; break; }
      }
    }
    
    let status = 'pending';
    if (statusText) {
      if (['已结束','已完成','待批阅','已批阅'].some(k => statusText.includes(k))) status = 'completed';
      else if (['已过期','已截止'].some(k => statusText.includes(k))) status = 'overdue';
      else if (statusText.includes('进行中')) status = 'in_progress';
    }
    
    // 解析时间
    let startTime = '', endTime = '';
    const timeMatches = timeInfo.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{1,2})/g);
    if (timeMatches) {
      startTime = timeMatches[0] || '';
      endTime = timeMatches[1] || '';
    }
    
    // 从标题提取日期
    if (!endTime) {
      const titleDate = title.match(/(\d{4})(\d{2})(\d{2})/);
      if (titleDate) {
        endTime = `${titleDate[1]}-${titleDate[2]}-${titleDate[3]} 23:59`;
      }
    }
    
    // 根据结束时间判断
    if (status === 'pending' && endTime) {
      const end = new Date(endTime.replace(' ', 'T'));
      if (!isNaN(end.getTime()) && end < new Date()) status = 'overdue';
    }
    
    exams.push({
      id: urlParams.taskrefId || '',
      courseId: urlParams.courseId || '',
      name: title || '未命名考试',
      status: status,
      statusText: statusText,
      startTime: startTime,
      endTime: endTime,
      url: dataUrl
    });
  }
  
  return exams;
}

async function syncData() {
  if (!appData.cookie) return { success: false, message: '未登录' };
  
  try {
    const client = createClient();
    
    // 获取课程列表
    const courseRes = await client.get('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json');
    const courses = [];
    if (courseRes.data && courseRes.data.channelList) {
      for (const ch of courseRes.data.channelList) {
        if (!ch.content?.course?.data) continue;
        for (const c of ch.content.course.data) {
          courses.push({ id: c.id || c.courseId, name: c.name || c.courseName, teacher: c.teacher || '' });
        }
      }
    }
    
    // 获取作业
    const hwRes = await client.get('https://mooc1-api.chaoxing.com/work/stu-work');
    const homeworks = parseHomeworks(hwRes.data);
    
    // 获取考试
    const examRes = await client.get('https://mooc1-api.chaoxing.com/exam-ans/exam/phone/examcode');
    const exams = parseExams(examRes.data);
    
    // 关联课程名
    const courseMap = {};
    courses.forEach(c => { courseMap[c.id] = c.name; });
    homeworks.forEach(h => { if (!h.courseName && courseMap[h.courseId]) h.courseName = courseMap[h.courseId]; });
    exams.forEach(e => { if (!e.courseName && courseMap[e.courseId]) e.courseName = courseMap[e.courseId]; });
    
    // 保存
    appData = { ...appData, courses, homeworks, exams, lastSync: new Date().toISOString() };
    saveData(appData);
    
    return {
      success: true,
      message: `同步完成：${courses.length}门课程，${homeworks.length}项作业，${exams.length}场考试`,
      courses, homeworks, exams
    };
  } catch (e) {
    return { success: false, message: '同步失败：' + e.message };
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('open-login', () => { openLoginWindow(); return { success: true }; });
ipcMain.handle('get-status', () => ({ success: true, loggedIn: !!appData.cookie, lastSync: appData.lastSync }));
ipcMain.handle('sync', async () => syncData());
ipcMain.handle('get-data', () => ({ success: true, data: appData }));
ipcMain.handle('logout', () => {
  appData = { cookie: '', courses: [], homeworks: [], exams: [], lastSync: null };
  saveData(appData);
  return { success: true };
});