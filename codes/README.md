# LearnPass 学习通助手 - 源代码

## 文件说明

| 文件 | 说明 |
|------|------|
| main.js | Electron 主进程，负责窗口管理、IPC 处理、登录窗口、数据读写 |
| preload.js | 预加载脚本，通过 contextBridge 安全地将主进程接口暴露给渲染进程 |
| index.html | Vue 3 单页应用，包含登录页、主界面（侧边栏+内容区）、作业/考试/课程/日历/提醒/统计页面 |
| chaoxing-api.js | 学习通 API 封装，包含作业/考试/课程数据获取与 HTML 解析 |
| scraper-main.js | 备用版主进程（隐藏窗口方案） |
| scraper-preload.js | 备用版预加载脚本 |
| scraper.html | 备用版前端界面 |
| package.json | 项目配置与依赖声明 |
| .gitignore | Git 忽略规则 |

## 运行方式

```bash
npm install
npm start
```
