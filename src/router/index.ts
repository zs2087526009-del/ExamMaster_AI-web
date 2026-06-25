import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
      },
      {
        path: 'courses',
        name: 'Courses',
        component: () => import('@/views/course/CourseListView.vue'),
      },
      {
        path: 'exam/start',
        name: 'ExamStart',
        component: () => import('@/views/exam/ExamStartView.vue'),
      },
      {
        path: 'exam/history',
        name: 'ExamHistory',
        component: () => import('@/views/exam/ExamHistoryView.vue'),
      },
      {
        path: 'exam/history/session',
        name: 'ExamSessionDetail',
        component: () => import('@/views/exam/ExamSessionDetailView.vue'),
      },
      {
        path: 'knowledge',
        name: 'Knowledge',
        component: () => import('@/views/knowledge/KnowledgeTreeView.vue'),
      },
      {
        path: 'knowledge/:courseId',
        name: 'KnowledgeCourse',
        component: () => import('@/views/knowledge/KnowledgeTreeView.vue'),
      },
      {
        path: 'questions',
        name: 'Questions',
        component: () => import('@/views/questions/QuestionListView.vue'),
      },
      {
        path: 'wrong-questions',
        name: 'WrongQuestions',
        component: () => import('@/views/wrong/WrongQuestionView.vue'),
      },
      {
        path: 'study-plan',
        name: 'StudyPlan',
        component: () => import('@/views/studyplan/StudyPlanView.vue'),
      },
      {
        path: 'user',
        name: 'UserCenter',
        component: () => import('@/views/user/UserCenterView.vue'),
      },
      {
        path: 'statistics',
        name: 'Statistics',
        component: () => import('@/views/statistics/StatisticsView.vue'),
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('@/views/rag/ChatView.vue'),
      },
      {
        path: 'chat/:courseId',
        name: 'ChatCourse',
        component: () => import('@/views/rag/ChatView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')

  if (to.matched.some((r) => r.meta.requiresAuth === true) && !token) {
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
