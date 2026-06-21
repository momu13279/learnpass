const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// 清除 require 缓存，确保加载最新代码
delete require.cache[require.resolve('./chaoxing-api')];
const chaoxingApi = require('./chaoxing-api');

let mainWindow;
let loginWindow = null;

// 数据存储路径
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DATA_FILE = path.join(DATA_DIR, 'app_data.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 默认数据模板（无学习通数据时使用）
function getDefaultData() {
  return {
    users: [{ id: 1, username: 'local', password: '123456', name: '本地用户', email: '', phone: '', avatar: '' }],
    courses: [],
    homeworks: [],
    exams: [],
    reminders: [],
    settings: {
      user_id: 1,
      sync_frequency: 'manual',
      theme: 'light',
      language: 'zh-CN',
      homework_reminder_times: ['1day', '6hour', '1hour'],
      exam_reminder_times: ['1day', '3hour', '1hour'],
      reminder_methods: ['app']
    },
    currentId: { homework: 1, exam: 1, reminder: 1 },
    chaoxing: {
      loggedIn: false,
      cookie: '',
      lastSync: null,
      userName: ''
    }
  };
}

// 存储数据
let appData = null;

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      appData = JSON.parse(raw);
      // 确保字段完整
      if (!appData.chaoxing) appData.chaoxing = { loggedIn: false, cookie: '', lastSync: null, userName: '' };
      if (!appData.currentId) appData.currentId = { homework: 1, exam: 1, reminder: 1 };
      console.log('数据已加载');
    } else {
      appData = getDefaultData();
      saveData();
      console.log('已创建默认数据');
    }
  } catch (err) {
    console.error('加载数据失败:', err);
    appData = getDefaultData();
  }
}

function saveData() {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(appData, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存数据失败:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: '学习通作业考试管理助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');

  // 开发时打开 DevTools
  // mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

/**
 * 打开学习通登录窗口
 */
function openChaoxingLogin() {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 950,
    height: 750,
    title: '登录学习通 - 支持账号密码/扫码/验证码登录',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // 使用独立的 session 避免污染主 session
  const loginSession = loginWindow.webContents.session;

  // 加载学习通登录页面（包含手机号/扫码/验证码等多种登录方式）
  loginWindow.loadURL('https://passport2.chaoxing.com/login?newversion=true&fid=-1');

  // 页面加载完成后，显示提示
  loginWindow.webContents.on('dom-ready', () => {
    loginWindow.webContents.executeJavaScript(`
      // 在页面顶部添加提示条
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#409eff;color:#fff;padding:8px 16px;font-size:13px;z-index:99999;text-align:center;';
      tip.innerHTML = '💡 提示：点击页面顶部的「机构账号登录」可切换为手机号/扫码/验证码登录，登录成功后本窗口将自动关闭';
      document.body.appendChild(tip);
      // 调整页面内容位置
      const content = document.querySelector('.login_content') || document.querySelector('#content') || document.body;
      if (content) content.style.marginTop = '36px';
    `).catch(() => {});
  });

  // 监听页面加载完成，检查是否登录成功
  loginWindow.webContents.on('did-navigate', (event, url) => {
    console.log('[LoginWindow] 导航到:', url);
    // 如果跳转到了学习通主页或课程页面，说明登录成功
    if (url.includes('i.chaoxing.com') || url.includes('mooc1.chaoxing.com') || url.includes('www.chaoxing.com')) {
      handleLoginSuccess(loginSession, url);
    }
  });

  loginWindow.webContents.on('did-navigate-in-page', (event, url) => {
    console.log('[LoginWindow] 页内导航到:', url);
    if (url.includes('i.chaoxing.com') || url.includes('mooc1.chaoxing.com') || url.includes('www.chaoxing.com')) {
      handleLoginSuccess(loginSession, url);
    }
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

/**
 * 登录成功后获取 Cookie 并保存
 */
async function handleLoginSuccess(loginSession, url) {
  try {
    console.log('[LoginWindow] 检测到登录成功，正在获取Cookie...');

    // 获取登录 session 的所有 cookie
    const cookies = await loginSession.cookies.get({ url: 'https://chaoxing.com' });
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    console.log('[LoginWindow] 获取到Cookie:', cookieStr.substring(0, 50) + '...');

    if (cookieStr.length > 10) {
      // 保存 Cookie
      appData.chaoxing.loggedIn = true;
      appData.chaoxing.cookie = cookieStr;
      appData.chaoxing.lastSync = null;
      saveData();

      // 通知主窗口
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chaoxing-login-success', {
          loggedIn: true,
          cookie: cookieStr
        });
      }

      // 关闭登录窗口
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
        loginWindow = null;
      }

      console.log('[LoginWindow] Cookie保存成功');
    }
  } catch (e) {
    console.error('[LoginWindow] 获取Cookie失败:', e.message);
  }
}

/**
 * 使用保存的 Cookie 进行真实数据同步
 */
async function realSync() {
  if (!appData.chaoxing.cookie) {
    return { success: false, message: '未登录学习通，请先登录' };
  }

  console.log('[Sync] 开始同步学习通数据...');
  const result = await chaoxingApi.syncAll(appData.chaoxing.cookie);

  if (result.success) {
    // 合并课程数据
    appData.courses = result.courses.map((c, idx) => ({
      id: idx + 1,
      lp_course_id: c.courseId,
      course_name: c.courseName,
      teacher: c.teacher,
      status: 'active'
    }));

    // 建立课程ID映射（学习通courseId -> 本地id）
    const courseMap = {};
    appData.courses.forEach(c => { courseMap[c.lp_course_id] = c.id; });

    // 合并作业数据
    let hwId = appData.currentId.homework;
    appData.homeworks = result.homeworks.map(hw => ({
      id: hwId++,
      lp_homework_id: hw.lp_homework_id,
      course_id: courseMap[hw.course_id] || 0,
      homework_name: hw.homework_name,
      course_name: hw.course_name,
      description: hw.description || '',
      deadline: hw.deadline,
      status: hw.status,
      submit_status: hw.submit_status,
      left_time: hw.left_time || ''
    }));
    appData.currentId.homework = hwId;

    // 合并考试数据
    let examId = appData.currentId.exam;
    appData.exams = result.exams.map(exam => ({
      id: examId++,
      lp_exam_id: exam.lp_exam_id,
      course_id: courseMap[exam.course_id] || 0,
      exam_name: exam.exam_name,
      course_name: exam.course_name,
      description: exam.description || '',
      start_time: exam.start_time,
      end_time: exam.end_time,
      location: exam.location || '',
      duration: exam.duration || 0,
      status: exam.status
    }));
    appData.currentId.exam = examId;

    appData.chaoxing.lastSync = new Date().toISOString();
    saveData();

    console.log(`[Sync] 同步完成：${appData.courses.length}门课程，${appData.homeworks.length}项作业，${appData.exams.length}场考试`);
  }

  return result;
}

app.whenReady().then(() => {
  loadData();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ==================== IPC 接口 ====================

// 本地登录（无需学习通账号时使用）
ipcMain.handle('login', async (event, credentials) => {
  const user = appData.users.find(u => u.username === credentials.username && u.password === credentials.password);
  if (user) {
    user.last_login = new Date().toISOString();
    saveData();
    return { success: true, user: { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar } };
  }
  return { success: false, message: '用户名或密码错误' };
});

ipcMain.handle('getUserProfile', async () => {
  const user = appData.users[0];
  return { success: true, data: { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar } };
});

ipcMain.handle('updateUserProfile', async (event, profile) => {
  const user = appData.users.find(u => u.id === profile.id || u.id === 1);
  if (user) {
    if (profile.name) user.name = profile.name;
    if (profile.email) user.email = profile.email;
    if (profile.phone) user.phone = profile.phone;
    saveData();
    return { success: true };
  }
  return { success: false, message: '用户不存在' };
});

// 获取课程
ipcMain.handle('getCourses', async () => {
  return { success: true, data: appData.courses };
});

// 作业管理
ipcMain.handle('getHomeworks', async () => {
  const homeworksWithCourse = appData.homeworks.map(hw => {
    const course = appData.courses.find(c => c.id === hw.course_id);
    return { ...hw, course_name: hw.course_name || course?.course_name || '' };
  });
  return { success: true, data: homeworksWithCourse };
});

ipcMain.handle('getHomeworkDetail', async (event, id) => {
  const hw = appData.homeworks.find(h => h.id === id);
  if (hw) {
    const course = appData.courses.find(c => c.id === hw.course_id);
    return { success: true, data: { ...hw, course_name: hw.course_name || course?.course_name || '' } };
  }
  return { success: false, message: '作业不存在' };
});

ipcMain.handle('updateHomeworkStatus', async (event, payload) => {
  const homework = appData.homeworks.find(h => h.id === payload.id);
  if (homework) {
    homework.status = payload.status;
    saveData();
    return { success: true };
  }
  return { success: false, message: '作业不存在' };
});

// 考试管理
ipcMain.handle('getExams', async () => {
  const examsWithCourse = appData.exams.map(exam => {
    const course = appData.courses.find(c => c.id === exam.course_id);
    return { ...exam, course_name: exam.course_name || course?.course_name || '' };
  });
  return { success: true, data: examsWithCourse };
});

ipcMain.handle('getExamDetail', async (event, id) => {
  const exam = appData.exams.find(e => e.id === id);
  if (exam) {
    const course = appData.courses.find(c => c.id === exam.course_id);
    return { success: true, data: { ...exam, course_name: exam.course_name || course?.course_name || '' } };
  }
  return { success: false, message: '考试不存在' };
});

ipcMain.handle('updateExamStatus', async (event, payload) => {
  const exam = appData.exams.find(e => e.id === payload.id);
  if (exam) {
    exam.status = payload.status;
    saveData();
    return { success: true };
  }
  return { success: false, message: '考试不存在' };
});

// ==================== 学习通相关接口 ====================

// 打开学习通登录窗口
ipcMain.handle('openChaoxingLogin', async () => {
  openChaoxingLogin();
  return { success: true };
});

// 获取学习通登录状态
ipcMain.handle('getChaoxingStatus', async () => {
  return {
    success: true,
    data: {
      loggedIn: appData.chaoxing.loggedIn,
      lastSync: appData.chaoxing.lastSync,
      cookie: appData.chaoxing.cookie ? '***' : ''
    }
  };
});

// 退出学习通登录
ipcMain.handle('chaoxingLogout', async () => {
  appData.chaoxing.loggedIn = false;
  appData.chaoxing.cookie = '';
  appData.chaoxing.lastSync = null;
  saveData();
  return { success: true };
});

// 真实数据同步
ipcMain.handle('syncData', async () => {
  if (!appData.chaoxing.loggedIn || !appData.chaoxing.cookie) {
    return { success: false, message: '未登录学习通，请先登录' };
  }

  const result = await realSync();
  return result;
});

// 提醒管理
ipcMain.handle('getReminders', async () => {
  return { success: true, data: appData.reminders };
});

ipcMain.handle('createReminder', async (event, reminder) => {
  const newReminder = {
    id: appData.currentId.reminder++,
    user_id: 1,
    ...reminder,
    status: 'pending'
  };
  appData.reminders.push(newReminder);
  saveData();
  return { success: true, data: newReminder };
});

ipcMain.handle('deleteReminder', async (event, id) => {
  const index = appData.reminders.findIndex(r => r.id === id);
  if (index > -1) {
    appData.reminders.splice(index, 1);
    saveData();
    return { success: true };
  }
  return { success: false, message: '提醒不存在' };
});

// 设置管理
ipcMain.handle('getSettings', async () => {
  return { success: true, data: appData.settings };
});

ipcMain.handle('updateSettings', async (event, settings) => {
  Object.assign(appData.settings, settings);
  saveData();
  return { success: true };
});

// 搜索功能
ipcMain.handle('searchItems', async (event, query) => {
  const q = query.toLowerCase();
  const homeworks = appData.homeworks.map(hw => {
    const course = appData.courses.find(c => c.id === hw.course_id);
    return { ...hw, type: 'homework', course_name: hw.course_name || course?.course_name || '' };
  }).filter(hw =>
    hw.homework_name.toLowerCase().includes(q) ||
    hw.course_name.toLowerCase().includes(q) ||
    (hw.description && hw.description.toLowerCase().includes(q))
  );

  const exams = appData.exams.map(exam => {
    const course = appData.courses.find(c => c.id === exam.course_id);
    return { ...exam, type: 'exam', course_name: exam.course_name || course?.course_name || '' };
  }).filter(exam =>
    exam.exam_name.toLowerCase().includes(q) ||
    exam.course_name.toLowerCase().includes(q) ||
    (exam.description && exam.description.toLowerCase().includes(q)) ||
    (exam.location && exam.location.toLowerCase().includes(q))
  );

  return { success: true, data: { homeworks, exams } };
});

// 数据导出
ipcMain.handle('exportData', async (event, format) => {
  const { homeworks, courses, exams } = appData;

  const exportObj = {
    exportTime: new Date().toISOString(),
    chaoxingSync: appData.chaoxing.lastSync,
    summary: {
      courseCount: courses.length,
      homeworkCount: homeworks.length,
      examCount: exams.length
    },
    courses: courses.map(c => ({
      course_name: c.course_name,
      teacher: c.teacher,
      status: c.status
    })),
    homeworks: homeworks.map(h => ({
      homework_name: h.homework_name,
      course: h.course_name || '',
      description: h.description,
      deadline: h.deadline,
      status: h.status,
      submit_status: h.submit_status
    })),
    exams: exams.map(e => ({
      exam_name: e.exam_name,
      course: e.course_name || '',
      description: e.description,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      status: e.status
    }))
  };

  return { success: true, data: exportObj };
});

// 获取统计数据
ipcMain.handle('getStats', async () => {
  const now = new Date();
  const homeworks = appData.homeworks;
  const exams = appData.exams;

  const totalHomework = homeworks.length;
  const totalExam = exams.length;
  const completedHomework = homeworks.filter(h => h.status === 'completed').length;
  const completedExam = exams.filter(e => e.status === 'completed').length;
  const overdueHomework = homeworks.filter(h => h.status === 'overdue').length;
  const pendingHomework = homeworks.filter(h => h.status === 'pending' || h.status === 'in_progress').length;
  const pendingExam = exams.filter(e => e.status === 'pending').length;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const thisWeekTasks = [...homeworks.filter(h => {
    const d = new Date(h.deadline);
    return d >= weekStart && d <= weekEnd;
  }).map(h => ({ ...h, type: 'homework' })), ...exams.filter(e => {
    const d = new Date(e.start_time);
    return d >= weekStart && d <= weekEnd;
  }).map(e => ({ ...e, type: 'exam' }))];

  return {
    success: true,
    data: {
      totalHomework,
      totalExam,
      completedHomework,
      completedExam,
      overdueHomework,
      pendingHomework,
      pendingExam,
      thisWeekTasks: thisWeekTasks.length
    }
  };
});