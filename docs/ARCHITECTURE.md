# ExamMaster AI — 前端架构设计

**基于后端 API 的全量架构 · 后续所有页面实现参照本文档**

---

## 1. 技术栈

| 类别 | 选型 | 版本 |
|------|------|------|
| 构建工具 | Vite | 6.x |
| 框架 | Vue 3 (`<script setup>`) | 3.5.x |
| 语言 | TypeScript | 5.6.x |
| UI 库 | Element Plus | 2.9.x |
| 状态管理 | Pinia | 2.3.x |
| HTTP | Axios | 1.7.x |
| 路由 | Vue Router 4 | 4.5.x |
| 图表 | ECharts (后续按需) | — |

---

## 2. 目录结构

```
src/
├── api/                    # API 请求层
│   ├── index.ts            # Axios 实例 + 拦截器
│   ├── auth.ts             # 登录/注册/登出
│   ├── course.ts           # 课程 CRUD
│   ├── document.ts         # 文档上传
│   ├── exam.ts             # 开始考试/提交
│   ├── grading.ts          # AI 重评分
│   ├── knowledgePoint.ts   # 知识点树/详情
│   ├── knowledgeMastery.ts # 掌握度
│   ├── question.ts         # 题目生成/查询
│   ├── statistics.ts       # 统计
│   ├── wrongQuestion.ts    # 错题本
│   ├── rag.ts              # RAG 对话 (SSE + history API)
│   └── tutor.ts            # AI 导师会话
│
├── router/
│   └── index.ts            # 路由配置 + 导航守卫
│
├── stores/                 # Pinia 状态管理
│   ├── auth.ts             # 用户/token
│   └── app.ts              # 全局 UI 状态
│
├── views/                  # 页面级组件
│   ├── auth/
│   │   ├── LoginView.vue
│   │   └── RegisterView.vue
│   ├── dashboard/
│   │   └── DashboardView.vue
│   ├── course/
│   │   ├── CourseListView.vue
│   │   └── CourseDetailView.vue
│   ├── exam/
│   │   ├── ExamStartView.vue
│   │   └── ExamResultView.vue
│   ├── knowledge/
│   │   └── KnowledgeTreeView.vue
│   ├── questions/
│   │   └── QuestionListView.vue
│   ├── wrong/
│   │   └── WrongQuestionView.vue
│   ├── statistics/
│   │   └── StatisticsView.vue
│   └── rag/
│       └── ChatView.vue
│
├── components/             # 公共组件
│   ├── layout/
│   │   ├── AppLayout.vue       # 主布局 (侧边栏+顶栏+内容区)
│   │   ├── SideNav.vue         # 左侧导航
│   │   └── TopBar.vue          # 顶栏 (用户信息/退出)
│   ├── common/
│   │   ├── QuestionCard.vue    # 题目展示卡片 (解析 content JSON)
│   │   ├── QuestionForm.vue    # 题目作答表单
│   │   ├── ScoreBadge.vue      # 分数/等级徽章
│   │   └── EmptyState.vue      # 空状态占位
│   └── exam/
│       ├── ChoiceQuestion.vue  # 选择题
│       ├── FillBlankQuestion.vue
│       ├── TrueFalseQuestion.vue
│       └── ShortAnswerQuestion.vue
│
├── composables/            # 组合式函数
│   ├── useRequest.ts       # 通用请求封装 (loading/error)
│   └── usePagination.ts    # 分页逻辑
│
├── utils/
│   ├── constants.ts        # 枚举映射/常量
│   └── format.ts           # 日期/数据格式化
│
├── types/
│   └── index.ts            # 全局 TypeScript 类型
│
├── assets/
│   └── styles/
│       ├── global.scss     # 全局样式/主题
│       └── variables.scss  # SCSS 变量
│
├── App.vue
└── main.ts
```

---

## 3. 路由设计

| 路径 | 页面 | 认证 | 说明 |
|------|------|------|------|
| `/login` | LoginView | 否 | 登录页 |
| `/register` | RegisterView | 否 | 注册页 |
| `/` | 重定向 | — | 已登录→/dashboard，未登录→/login |
| `/dashboard` | DashboardView | 是 | 首页概览 |
| `/courses` | CourseListView | 是 | 课程列表 |
| `/courses/:id` | CourseDetailView | 是 | 课程详情 |
| `/exam/start` | ExamStartView | 是 | 考试答题页 |
| `/exam/result/:recordId` | ExamResultView | 是 | 考试结果页 |
| `/knowledge/:courseId` | KnowledgeTreeView | 是 | 知识点树 |
| `/questions` | QuestionListView | 是 | 题目列表 |
| `/wrong-questions` | WrongQuestionView | 是 | 错题本 |
| `/statistics` | StatisticsView | 是 | 学习统计 |
| `/chat/:courseId` | ChatView | 是 | AI 对话 |

**导航守卫：**
- `beforeEach`: 路由 `meta.requiresAuth === true` 且未登录 → 重定向 `/login`
- 已登录用户访问 `/login` 或 `/register` → 重定向 `/dashboard`

---

## 4. API 层设计

### 4.1 Axios 实例 (`api/index.ts`)

```
baseURL: "/api"
timeout: 30000
```

- **请求拦截器**：从 auth store 读取 token，附加 `Authorization: Bearer <token>` (非 auth 接口)
- **响应拦截器**：
  - 401 → 清除 auth state → 跳转 `/login`
  - 其他错误 → 返回 rejected promise，由调用方处理
- Vite proxy: `/api` → `http://localhost:8080`

### 4.2 API 模块清单

| 模块 | 接口 | 方法 | 路径 |
|------|------|------|------|
| **auth** | 登录 | POST | `/api/auth/login` |
| | 注册 | POST | `/api/auth/register` |
| | 登出 | POST | `/api/auth/logout` |
| **course** | 创建课程 | POST | `/api/courses` |
| | 课程列表 | GET | `/api/courses` |
| | 课程详情 | GET | `/api/courses/{id}` |
| | 更新课程 | PUT | `/api/courses/{id}` |
| | 删除课程 | DELETE | `/api/courses/{id}` |
| **document** | 上传文档 | POST | `/api/documents/upload` (multipart) |
| **exam** | 开始考试 | POST | `/api/exams/start` |
| | 提交考试 | POST | `/api/exams/submit` |
| **grading** | AI 重评分 | POST | `/api/grading/regrade/{recordId}` |
| **knowledgePoint** | 知识点树 | GET | `/api/knowledge-points/courses/{courseId}` |
| | 知识点详情 | GET | `/api/knowledge-points/{id}` |
| | 删除知识点 | DELETE | `/api/knowledge-points/{id}` |
| **knowledgeMastery** | 掌握度列表 | GET | `/api/knowledge-mastery?courseId=` |
| **question** | 生成题目 | POST | `/api/questions/generate` |
| | 题目列表 | GET | `/api/questions?knowledgePointId=` |
| | 题目详情 | GET | `/api/questions/{id}` |
| | 删除单个 | DELETE | `/api/questions/{id}` |
| | 批量删除 | DELETE | `/api/questions?knowledgePointId=` |
| **statistics** | 课程统计 | GET | `/api/statistics?courseId=` |
| | 总览统计 | GET | `/api/statistics/overview` |
| **wrongQuestion** | 错题列表 | GET | `/api/wrong-questions` (分页) |
| | 删除错题 | DELETE | `/api/wrong-questions/{id}` |
| | 错题练习 | POST | `/api/wrong-questions/practice` |
| **rag** | AI 对话 | POST | `/api/rag/chat` (SSE 流) |
| **tutor** | 开始导师会话 | POST | `/api/tutor/sessions` |
| | 获取活跃会话（含历史轮次） | GET | `/api/tutor/sessions/active?courseId=` |
| | 获取会话状态 | GET | `/api/tutor/sessions/{sessionId}` |
| | 提交答案（流式） | POST | `/api/tutor/sessions/{sessionId}/answer/stream` (SSE) |
| | 提交答案 | POST | `/api/tutor/sessions/{sessionId}/answer` |
| | 结束会话 | POST | `/api/tutor/sessions/{sessionId}/end` |

### 4.3 Tutor API (`api/tutor.ts`)

导师模式通过 REST 轮询（非 SSE）与 LangGraph4j 后端交互：

| 函数 | 路径 | 说明 |
|------|------|------|
| `startSession(data)` | `POST /api/tutor/sessions` | 开始新会话；若 Redis 有同课程活跃会话则返回现有状态 |
| `getActiveSession(courseId)` | `GET /api/tutor/sessions/active?courseId=` | 恢复活跃会话 + `tutor_turn` 历史轮次；无活跃会话返回 null |
| `getSession(sessionId)` | `GET /api/tutor/sessions/{sessionId}` | 查询当前阶段、轮次、知识点与题目 |
| `submitAnswerStream(sessionId, data)` | `POST .../answer/stream` | SSE 流式提交答案 |
| `submitAnswer(sessionId, data)` | `POST /api/tutor/sessions/{sessionId}/answer` | 提交答案；`data`: `{ answer }` |
| `endSession(sessionId)` | `POST /api/tutor/sessions/{sessionId}/end` | 结束会话；使用 `{ silent: true }` 避免切换模式时弹出错误提示 |

响应类型见 §7 `TutorSessionResponse` / `TutorSessionDetailResponse` / `TutorTurnView` / `TutorAnswerResponse`；`nextAction` 为 `FOLLOW_UP` | `NEXT_KNOWLEDGE_POINT` | `FINISHED`。

## 5. 状态管理

### 5.1 Auth Store (`stores/auth.ts`)

```typescript
state: {
  token: string | null
  user: { userId: number; username: string; nickname: string } | null
}
getters: { isLoggedIn: boolean, displayName: string }
actions: {
  login(username, password): Promise<void>
  register(data): Promise<void>
  logout(): Promise<void>
  restoreSession(): void  // 从 localStorage 恢复
}
```

- token 持久化到 `localStorage`
- 页面刷新后 `restoreSession()` 在 `main.ts` 中调用

### 5.2 App Store (`stores/app.ts`)

```typescript
state: {
  currentCourse: CourseResponse | null
  sidebarCollapsed: boolean
}
actions: {
  setCurrentCourse(course): void
  toggleSidebar(): void
}
```

---

## 6. 页面功能说明

### 6.1 认证模块

#### LoginView — `/login`
- 左右分栏：左品牌区（绿渐变）+ 右表单区
- 表单字段：用户名、密码（带显隐切换）
- 记住我复选框（前端 only）、忘记密码链接（占位）
- 登录成功 → 存 token → 跳转 `/dashboard`
- 底部链接跳转 `/register`

#### RegisterView — `/register`
- 同 LoginView 布局
- 字段：用户名、密码、确认密码、昵称(选填)、邮箱(选填)
- 注册成功 → 自动登录 → 跳转 `/dashboard`

### 6.2 主布局 AppLayout

- **左侧导航 (SideNav)**：课程管理、考试、知识点、题目库、错题本、统计、AI 对话
- **顶栏 (TopBar)**：用户头像/昵称、退出按钮
- **内容区**：`<router-view>` 子路由

### 6.3 课程管理 — `/courses`、`/courses/:id`
- 课程列表：卡片网格，每张卡片显示课程名/教师/学期
- 新建/编辑课程：Dialog 表单
- 课程详情：知识点树入口、考试入口、上传文档、统计数据

### 6.4 考试 — `/exam/start`、`/exam/result/:recordId`
- 开始考试：选择课程 + 知识点范围 → 获取题目（不含答案）
- 答题页：按题目类型渲染不同组件（ChoiceQuestion 等）
- 提交：发 answers[] → 展示结果（正确数/错误数/待批分数）
- 主观题可触发 AI 重评分

### 6.5 知识点树 — `/knowledge/:courseId`
- 按章节分组的知识点树（Element Plus Tree）
- 每个节点显示掌握度（KnowledgeMastery）
- 可展开查看详情、生成题目

### 6.6 题目库 — `/questions`
- 按知识点筛选题目列表
- 题目 content 字段需 JSON.parse 渲染
- 支持删除/批量删除

### 6.7 错题本 — `/wrong-questions`
- 分页表格，按课程/知识点筛选
- 每行显示题目、错误答案、正确答案、错误次数
- 支持删除、发起错题练习

### 6.8 统计 — `/statistics`
- 总览：总题数、正确率、按题型分布（ECharts 饼图）
- 按课程筛选统计

### 6.9 AI 对话 — `/chat/:courseId`（ChatView 双模式）

顶栏以 **课程名** 为主标题（含 `CourseSeal`、教师/学期副标题），第二行展示模式状态：
- **问答**：`基于本课程资料回答`
- **导师**：`第 N/M 轮 · 当前知识点 · 掌握度`

模式切换带 Tooltip（问答 = 你问 AI 答；导师 = AI 出题你答）。离开进行中的导师会话时弹出确认；问答历史从后端 `GET /api/rag/history` 加载（最近 50 条）；模式偏好仍缓存至 `sessionStorage`。

**会话持久化：**
- **问答**：`chat_message` 表持久化；进入页面 / 切回问答时 `GET /api/rag/history?courseId=` 恢复；发送时后端自动加载近 20 条作为 LLM 多轮上下文
- **导师**：`GET /api/tutor/sessions/active?courseId=` 从 Redis checkpoint + `tutor_turn` 表恢复活跃会话与历史轮次；离开页面不再自动 `endSession`

空状态提供 **快捷提问芯片**（从课程知识点树 / 掌握度动态生成）：
- 问答：如「总结本章重点」「XX 的核心概念是什么？」
- 导师：如「开始薄弱点练习」「只练第 X 章」（调用 `startSession` 并传入 `knowledgePointIds`）

#### RAG 模式（默认）
- 聊天界面，SSE 流式接收回复
- 后端使用 **Spring AI Tool Calling**（`ToolCallAdvisor` + `@Tool`），由模型按需调用工具后再生成回答
- 可用工具：`searchCourseKnowledge`（语义检索）、`getKnowledgeMastery`（掌握度）、`listWrongQuestions`（错题本）、`listKnowledgePoints`（知识点目录）、`listMyCourses` / `getCourseDetail` / `createCourse` / `updateCourse` / `deleteCourse`（课程管理）
- SSE 事件：`status`（工具执行进度）、`content`、`references`（检索工具命中后汇总）、`course_changed`（课程增删改后刷新列表）、`error`
- 首 token 前展示 `rag_thinking` 卡片（与导师 thinking 样式一致）；`status` 文案随工具调用更新（如「正在检索课程资料…」）
- AI 回复经 `markdown-it` 渲染 + `DOMPurify` 消毒；参考来源为可折叠 `ReferenceCards`，可展开全文并跳转知识库
- 使用 `fetch` ReadableStream 解析 SSE

#### 导师模式
- 进入页面时优先 `getActiveSession(courseId)` 恢复 Redis checkpoint + 历史 `tutor_turn` 对话；无活跃会话再 `startSession`
- 用户输入答案后调用 `submitAnswerStream`（SSE），渲染评分反馈与下一题
- 消息类型（`Message.kind`）：
  - `tutor_system` — 居中窄条（开场白 / 结束语）
  - `tutor_question` — 「题目」标签 + 难度徽章 + 知识点 chip
  - `tutor_thinking` — 等待评分时的动态提示
  - `tutor_feedback` — 环形分数、遗漏要点、**改进建议**（`suggestions`）
- 助手头像：问答用 `dialogue`（助教），导师用 `quill`（严厉导师）
- 导师结束后输入区替换为「开始新一轮辅导」按钮
- 流式输出时仅在用户位于底部附近时自动滚动，否则显示「↓ 新消息」按钮
- 切换至 RAG：确认后静默 `endSession`，从 API 加载问答历史
- 切换课程：结束上一课程的 tutor 会话；新课程在导师模式下尝试 `getActiveSession` 恢复
- 离开页面 / 刷新：**不**自动 `endSession`（问答由后端 `chat_message` 持久化，导师依赖后端 Redis）
- 输入框随内容自动增高（max 160px）；移动端发送按钮为圆形图标

---

## 7. TypeScript 类型映射

```typescript
// 枚举
type QuestionType = 'CHOICE' | 'FILL_BLANK' | 'TRUE_FALSE' | 'SHORT_ANSWER'
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
type ParseStatus = 'PENDING' | 'PARSING' | 'SUCCESS' | 'FAILED'

// 分页
interface PageResult<T> { records: T[]; total: number; pages: number; current: number; size: number }

// Auth
interface LoginRequest { username: string; password: string }
interface RegisterRequest { username: string; password: string; nickname?: string; email?: string }
interface AuthResponse { userId: number; username: string; nickname: string; token: string }

// Course
interface CourseRequest { courseName: string; courseDescription?: string; teacher?: string; semester?: string }
interface CourseResponse { id: number; courseName: string; courseDescription: string; teacher: string; semester: string; createTime: string; updateTime: string }

// Exam
interface ExamStartRequest { courseId: number; knowledgePointIds?: number[] }
interface ExamStartResponse { questions: ExamQuestionItem[]; totalCount: number }
interface ExamQuestionItem { id: number; knowledgePointId: number; questionType: QuestionType; content: string; difficulty: Difficulty }
interface ExamSubmitRequest { courseId: number; answers: AnswerItem[] }
interface AnswerItem { questionId: number; userAnswer: string }
interface ExamSubmitResponse { totalCount: number; correctCount: number; wrongCount: number; ungradedCount: number; records: RecordItem[] }
interface RecordItem { questionId: number; questionType: string; score: number; userAnswer: string; correctAnswer: string }

// Knowledge
interface KnowledgePointResponse { id: number; courseId: number; documentId: number; chapter: string; name: string; description: string; importance: number; parentId: number; createTime: string }
interface KnowledgeTreeResponse { courseId: number; chapters: ChapterNode[] }
interface ChapterNode { chapter: string; knowledgePoints: KnowledgePointResponse[] }
interface KnowledgeMasteryResponse { knowledgePointId: number; masteryScore: number }

// Question
interface QuestionResponse { id: number; courseId: number; knowledgePointId: number; questionType: QuestionType; content: string; answer: string; difficulty: Difficulty; createTime: string }
interface GenerateQuestionRequest { courseId: number; knowledgePointIds?: number[]; config?: QuestionConfig }
interface QuestionConfig { choiceCount?: number; fillBlankCount?: number; trueFalseCount?: number; shortAnswerCount?: number }
interface GenerateQuestionResponse { generatedCount: number; failedCount: number }

// WrongQuestion
interface WrongQuestionResponse { id: number; questionId: number; knowledgePointId: number; questionType: string; latestUserAnswer: string; correctAnswer: string; latestScore: number; feedback: GradingFeedback | null; wrongCount: number; lastWrongTime: string; createTime: string }

// Grading
interface GradingResultResponse { recordId: number; questionType: string; score: number; feedback: GradingFeedback | null }
interface GradingFeedback { missingPoints: string[]; suggestions: string[] }

// Statistics
interface StatisticsResponse { totalCount: number; correctCount: number; wrongCount: number; ungradedCount: number; accuracyRate: number; typeDistribution: TypeDistribution[] }
interface TypeDistribution { questionType: string; count: number }

// RAG
interface ChatRequest { courseId: number; question: string }
interface ChatMessageVO { id: number; role: 'user' | 'assistant'; content: string; references?: ReferenceVO[] | null; createTime: string }
interface ChatHistoryResponse { courseId: number; messages: ChatMessageVO[] }
interface SseEvent { type: 'content' | 'references' | 'status' | 'tool_call' | 'course_changed' | 'error'; content: string | null; references: ReferenceVO[] | null }
interface ReferenceVO { title: string; content: string }

// Tutor
interface TutorStartSessionRequest { courseId: number; maxRounds?: number; knowledgePointIds?: number[] }
interface TutorAnswerRequest { answer: string }
interface TutorKnowledgePointView { id: number; name: string; masteryScore: number | null }
interface TutorQuestionView { questionId: number; questionType: string; content: Record<string, unknown> | string | null; difficulty: string }
interface TutorFeedbackView { missingPoints: string[]; suggestions: string[] }
type TutorNextAction = 'FOLLOW_UP' | 'NEXT_KNOWLEDGE_POINT' | 'FINISHED'
interface TutorSessionResponse { sessionId: string; phase: string; totalRounds: number; maxRounds: number; currentKnowledgePoint: TutorKnowledgePointView | null; question: TutorQuestionView | null; openingComment: string | null }
interface TutorAnswerResponse { sessionId: string; phase: string; score: number | null; feedback: TutorFeedbackView | null; tutorComment: string | null; masteryScore: number | null; nextAction: TutorNextAction; totalRounds: number; question: TutorQuestionView | null; closingComment: string | null }
```

---

## 8. 实现顺序

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| **Phase 1** | 项目脚手架 + Axios + Router + Auth Store + LoginView + RegisterView + Dashboard 占位 | P0 |
| **Phase 2** | AppLayout (侧边栏+顶栏) + CourseListView + CourseDetailView | P1 |
| **Phase 3** | KnowledgeTreeView + QuestionListView + 题目生成 | P1 |
| **Phase 4** | ExamStartView + ExamResultView (含四种题型组件) | P1 |
| **Phase 5** | WrongQuestionView + StatisticsView | P2 |
| **Phase 6** | ChatView (SSE) + AI 对话 | P2 |
| **Phase 7** | ChatView 导师双模式 + `api/tutor.ts` | P2 |

---

## 9. 开发环境配置

- Vite dev server: `http://localhost:5173`
- Proxy `/api` → `http://localhost:8080` (Spring Boot)
- 需后端先启动，前端再启动
- 启动命令: `npm run dev`
