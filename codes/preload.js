const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('api', {
    // 用户认证
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getUserProfile: () => ipcRenderer.invoke('getUserProfile'),
    updateUserProfile: (profile) => ipcRenderer.invoke('updateUserProfile', profile),

    // 课程管理
    getCourses: () => ipcRenderer.invoke('getCourses'),

    // 作业管理
    getHomeworks: () => ipcRenderer.invoke('getHomeworks'),
    getHomeworkDetail: (id) => ipcRenderer.invoke('getHomeworkDetail', id),
    updateHomeworkStatus: (payload) => ipcRenderer.invoke('updateHomeworkStatus', payload),

    // 考试管理
    getExams: () => ipcRenderer.invoke('getExams'),
    getExamDetail: (id) => ipcRenderer.invoke('getExamDetail', id),
    updateExamStatus: (payload) => ipcRenderer.invoke('updateExamStatus', payload),

    // 数据同步
    syncData: () => ipcRenderer.invoke('syncData'),

    // 学习通相关
    openChaoxingLogin: () => ipcRenderer.invoke('openChaoxingLogin'),
    getChaoxingStatus: () => ipcRenderer.invoke('getChaoxingStatus'),
    chaoxingLogout: () => ipcRenderer.invoke('chaoxingLogout'),
    onChaoxingLoginSuccess: (callback) => ipcRenderer.on('chaoxing-login-success', (event, data) => callback(data)),

    // 提醒管理
    getReminders: () => ipcRenderer.invoke('getReminders'),
    createReminder: (reminder) => ipcRenderer.invoke('createReminder', reminder),
    deleteReminder: (id) => ipcRenderer.invoke('deleteReminder', id),

    // 设置管理
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),

    // 搜索
    searchItems: (query) => ipcRenderer.invoke('searchItems', query),

    // 数据导出
    exportData: (format) => ipcRenderer.invoke('exportData', format),

    // 统计
    getStats: () => ipcRenderer.invoke('getStats')
  });
  console.log('[preload] API exposed successfully');
} catch (err) {
  console.error('[preload] Failed to expose API:', err);
}