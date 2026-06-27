# LearnPass 学习通助手

一款基于 Electron + Vue 3 的桌面应用程序，帮助高校学生统一管理学习通平台上的作业、考试和课程任务。

## 功能特性

- **学习通登录**：支持账号密码、扫码、验证码三种登录方式
- **数据同步**：一键同步课程、作业、考试数据
- **作业管理**：按状态筛选（待完成/已逾期/已完成/待互评），支持详情查看
- **考试管理**：考试列表展示，状态筛选与详情查看
- **课程管理**：课程列表展示，关联作业与考试
- **日历视图**：月历展示作业与考试安排，按状态颜色区分
- **数据统计**：作业完成率、课程统计等可视化分析
- **数据导出**：支持导出为 JSON 格式

## 技术栈

| 技术 | 说明 |
|------|------|
| Electron 28 | 跨平台桌面应用框架 |
| Vue 3 | 渐进式前端框架（CDN 引入） |
| Element Plus | UI 组件库（CDN 引入） |
| Axios | HTTP 请求库 |
| Node.js | 后端运行时 |

## 项目结构

```
├── codes/                  # 源代码
│   ├── main.js             # Electron 主进程
│   ├── preload.js          # 预加载脚本（IPC 桥接）
│   ├── index.html          # Vue 3 前端界面
│   ├── chaoxing-api.js     # 学习通 API 封装
│   ├── scraper-main.js     # 备用版主进程
│   ├── scraper-preload.js # 备用版预加载脚本
│   ├── scraper.html        # 备用版前端界面
│   ├── package.json        # 项目配置
│   └── .gitignore          # Git 忽略规则
├── docs/                   # 项目文档
│   ├── 可行性分析报告.md
│   ├── 需求规格说明书.md
│   ├── 概要设计说明书.md
│   ├── 详细设计说明书.md
│   ├── 测试计划与报告.md
│   └── 期末大作业说明书.md
└── 学习通作业考试管理助手/  # 打包后的可执行文件
```

## 运行步骤

### 环境要求

- **Node.js** 18.0 及以上版本
- **npm** 9.0 及以上版本
- **操作系统** Windows 10/11

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/momu13279/learnpass.git
cd learnpass/codes

# 2. 安装依赖
npm install

# 3. 启动应用
npm start
```

### 打包为 EXE

```bash
# 使用 electron-packager 打包
npx electron-packager . "LearnPass" --platform=win32 --arch=x64 --out=dist --overwrite --no-prune

# 打包后的可执行文件位于 dist/LearnPass-win32-x64/ 目录下
```

## 使用说明

1. 启动应用后，设置本地登录密码（首次使用）
2. 点击 **"登录学习通"** 按钮，在弹出的窗口中完成学习通登录
   - 支持账号密码、扫码、验证码三种方式
   - 登录成功后窗口自动关闭
3. 点击 **"同步数据"** 按钮，自动获取课程、作业、考试数据
4. 通过左侧导航栏切换不同功能页面
5. 在日历视图中查看近期的作业和考试安排

## 系统架构

采用 Electron 主进程与渲染进程分离架构：

- **主进程（main.js）**：负责窗口管理、IPC 通信处理、数据持久化存储
- **渲染进程（index.html）**：Vue 3 单页应用，负责用户界面展示与交互
- **预加载脚本（preload.js）**：通过 contextBridge 安全地将主进程接口暴露给渲染进程
- **API 封装（chaoxing-api.js）**：封装学习通平台 API，负责 HTTP 请求、Cookie 认证、HTML 解析

## 参考文档

本项目参考了以下开源项目的文档结构：

- [RoomManger4University](https://github.com/maczone/RoomManger4University)（已 fork，参考文档模板）

## 许可证

MIT License
