# Login Page Design

**Date:** 2026-06-17
**Status:** Approved
**Backend:** ExamMaster AI (Spring Boot, D:/git_hub/ExamMaster AI)

## Overview

Build the login page for ExamMaster AI web frontend based on the existing backend auth API. The workspace `ExamMaster AI-web` is currently empty — start from scratch with Vue 3 + TypeScript + Element Plus.

## Backend API Reference

| Endpoint | Method | Auth | Request | Response |
|----------|--------|------|---------|----------|
| `/api/auth/login` | POST | No | `{username, password}` | `{userId, username, nickname, token}` |
| `/api/auth/register` | POST | No | `{username, password, nickname?, email?}` | `{userId, username, nickname, token}` |
| `/api/auth/logout` | POST | Yes | — | — |

- Error responses: `{code: 401, message: "...", data: null}`
- Token: JWT, passed via `Authorization: Bearer <token>`, validated by backend interceptor against Redis

## Tech Stack

| Concern | Choice |
|---------|--------|
| Build | Vite 5 |
| Framework | Vue 3 + `<script setup>` + TypeScript |
| UI | Element Plus |
| State | Pinia + localStorage persistence |
| HTTP | Axios |
| Router | Vue Router 4 |

## Route Design

| Path | View | Auth Required |
|------|------|---------------|
| `/login` | LoginView | No |
| `/register` | RegisterView | No |
| `/` | redirect → `/login` | — |
| `/dashboard` | DashboardView (placeholder) | Yes |

## Directory Structure

```
ExamMaster AI-web/
├── src/
│   ├── api/
│   │   ├── index.ts              # Axios instance + interceptors
│   │   └── auth.ts               # login(), register(), logout()
│   ├── router/
│   │   └── index.ts              # Routes + navigation guard
│   ├── stores/
│   │   └── auth.ts               # Pinia: token/user state
│   ├── views/
│   │   ├── LoginView.vue         # Login page
│   │   └── RegisterView.vue      # Register page
│   ├── assets/
│   │   └── styles/
│   │       └── auth.scss         # Shared auth page styles
│   ├── App.vue
│   └── main.ts
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Login Page Design

### Layout: Split Screen

- **Left (40%)**: Green gradient background (`#07c160` → `#10b981`), branding content
  - App name: "ExamMaster AI"
  - Tagline: "AI 驱动的智能学习平台"
  - Feature highlights: 智能出题 · AI 批改 · 知识图谱
- **Right (60%)**: White background, login form
  - Title: "用户登录"
  - Username input (prefix icon: User)
  - Password input (prefix icon: Lock, suffix icon: eye toggle)
  - Row: "记住我" checkbox + "忘记密码？" link
  - Submit button: "登 录" (full width, green theme)
  - Footer link: "还没有账号？立即注册 →"

### Color Scheme

- Primary gradient: `#07c160` → `#10b981`
- Use Element Plus green theme or CSS variables override

### Form Validation

| Field | Rules |
|-------|-------|
| Username | Required, 2-50 chars |
| Password | Required, 6-100 chars |

- Validation triggers on blur and on submit
- Errors displayed inline below the field (Element Plus default)

### Interaction Details

- **Password toggle**: Eye icon on password suffix, click toggles show/hide
- **Submit loading**: Button shows loading spinner + "登录中..." text during API call
- **API errors**: `ElMessage.error()` with backend message (e.g. "用户名或密码错误")
- **Network errors**: `ElMessage.error('网络异常，请稍后重试')`
- **Success**: Store token + user in Pinia (persisted to localStorage), redirect to `/dashboard`
- **"记住我"**: UI only for now — backend has no refresh token API yet. When implemented, extend token expiry to 7 days.

## API Layer

### Axios Instance (`api/index.ts`)

- `baseURL: "/api"`
- Request interceptor: attach `Authorization: Bearer <token>` from auth store
- Response interceptor: on 401, clear auth state and redirect to `/login`
- Vite dev server proxy: `/api` → `http://localhost:8080` (backend)

### Auth API (`api/auth.ts`)

```typescript
login(data: LoginRequest): Promise<AuthResponse>
register(data: RegisterRequest): Promise<AuthResponse>
logout(): Promise<void>
```

## State Management (Pinia)

### Auth Store (`stores/auth.ts`)

```typescript
state: {
  token: string | null
  user: { userId: number; username: string; nickname: string } | null
}
getters: { isLoggedIn, userName }
actions: { login(), register(), logout(), restoreSession() }
```

- `login()` / `register()`: call API → save token + user → persist to localStorage
- `logout()`: call API → clear state + localStorage → redirect to `/login`
- `restoreSession()`: read token from localStorage on app init

## Router Guard

- `beforeEach`: if route requires auth and user is not logged in → redirect to `/login`
- If logged-in user visits `/login` or `/register` → redirect to `/dashboard`

## Scope

### This Phase
- Project scaffolding (Vite + Vue 3 + TS + Element Plus)
- Axios setup with interceptors
- Pinia auth store
- Vue Router with guards
- LoginView (full implementation)
- RegisterView (full implementation)
- DashboardView (placeholder)
- Vite proxy config

### Out of Scope
- "忘记密码" page (link exists but page not implemented)
- "记住我" backend support
- Dashboard implementation
- Tests (add in follow-up)

## Register Page (Brief)

Same split-screen layout as login. Left side identical. Right side form:

| Field | Required | Notes |
|-------|----------|-------|
| Username | Yes | 2-50 chars |
| Password | Yes | 6-100 chars |
| Confirm Password | Yes | Must match password |
| Nickname | No | Display name |
| Email | No | Valid email format |

On success: auto-login (store token) → redirect to `/dashboard`.
Footer link: "已有账号？立即登录 →"
