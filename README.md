# ExamMaster AI Web

ExamMaster AI（智考官）前端应用，基于 Vue 3 + TypeScript + Element Plus。

## 技术栈

- Vue 3.5 · TypeScript · Vite 6
- Element Plus · Pinia · Vue Router 4
- Axios（对接后端 `Result<T>` 统一响应）

## 快速开始

### 前置依赖

- Node.js 18+
- 后端服务已启动（默认 `http://localhost:8080`）

### 安装与运行

```bash
npm install
npm run dev
```

访问：`http://localhost:5173`

### 构建

```bash
npm run build
npm run preview
```

## 功能页面

| 路由 | 功能 |
|------|------|
| `/dashboard` | 仪表盘：统计概览与「继续学习」 |
| `/courses` | 课程管理、文档上传 |
| `/chat/:courseId` | RAG AI 问答 |
| `/knowledge/:courseId` | 知识点树 |
| `/questions` | 题库生成与管理 |
| `/exam/start` | 开始考试 |
| `/exam/history` | 答题历史（场次列表） |
| `/wrong-questions` | 错题本 |
| `/study-plan` | 学习计划 |
| `/statistics` | 统计分析 |
| `/user` | 个人中心 |

## 开发配置

API 代理配置见 `vite.config.ts`：

```ts
proxy: {
  '/api': { target: 'http://localhost:8080', changeOrigin: true }
}
```

认证 Token 存储于 `localStorage` 或 `sessionStorage`，请求拦截器自动附加 `Authorization: Bearer {token}`。

## 项目结构

```
src/
├── api/          # API 封装（按模块拆分）
├── components/   # 布局与通用组件
├── router/       # 路由与鉴权守卫
├── stores/       # Pinia 状态
├── types/        # TypeScript 类型
├── utils/        # 工具函数
└── views/        # 页面视图
```

## 相关文档

后端 API 与架构说明见 [ExamMaster AI/docs/项目实现设计文档.md](../ExamMaster%20AI/docs/项目实现设计文档.md)。
