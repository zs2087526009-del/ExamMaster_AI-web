// ==================== Enums ====================
export type QuestionType = 'CHOICE' | 'FILL_BLANK' | 'TRUE_FALSE' | 'SHORT_ANSWER'
export type WrongQuestionExportFormat = 'pdf' | 'docx'
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
export type ParseStatus = 'PENDING' | 'PARSING' | 'EXTRACTING' | 'SUCCESS' | 'FAILED'

// ==================== Pagination ====================
export interface PageResult<T> {
  records: T[]
  total: number
  pages: number
  current: number
  size: number
}

// ==================== Auth ====================
export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  password: string
  nickname?: string
  email?: string
}

export interface AuthResponse {
  userId: number
  username: string
  nickname: string
  token: string
}

export interface UserInfo {
  userId: number
  username: string
  nickname: string
  email?: string
}

// ==================== User Profile ====================
export interface UserProfileResponse {
  id: number
  username: string
  nickname: string
  email: string | null
  createTime: string
}

export interface UpdateProfileRequest {
  nickname?: string
  email?: string
}

export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}

// ==================== Course ====================
export interface CourseRequest {
  courseName: string
  courseDescription?: string
  teacher?: string
  semester?: string
}

export interface CourseResponse {
  id: number
  courseName: string
  courseDescription: string
  teacher: string
  semester: string
  createTime: string
  updateTime: string
}

// ==================== Document ====================
export interface DocumentUploadResponse {
  documentId: number
  fileName: string
  fileType: string
  fileSize: number
  status: string
}

export interface DocumentResponse {
  id: number
  courseId: number
  fileName: string
  fileType: string
  fileSize: number
  parseStatus: ParseStatus
  fileUrl: string | null
  createTime: string
}

// ==================== Knowledge Point ====================
export interface KnowledgePointResponse {
  id: number
  courseId: number
  documentId: number
  chapter: string
  name: string
  description: string
  importance: number
  parentId: number
  createTime: string
}

export interface ChapterNode {
  chapter: string
  knowledgePoints: KnowledgePointResponse[]
}

export interface KnowledgeTreeResponse {
  courseId: number
  chapters: ChapterNode[]
}

export interface KnowledgeMasteryResponse {
  knowledgePointId: number
  masteryScore: number
  repetitionCount?: number
  intervalDays?: number
  nextReviewDate?: string | null
  dueForReview?: boolean
}

// ==================== Question ====================
export interface QuestionResponse {
  id: number
  courseId: number
  knowledgePointId: number
  questionType: QuestionType
  content: string
  answer: string
  difficulty: Difficulty
  createTime: string
}

export interface QuestionConfig {
  choiceCount?: number
  fillBlankCount?: number
  trueFalseCount?: number
  shortAnswerCount?: number
}

export interface GenerateQuestionRequest {
  courseId: number
  knowledgePointIds?: number[]
  config?: QuestionConfig
}

export interface GenerateQuestionResponse {
  generatedCount: number
  failedCount: number
}

// ==================== Exam ====================
export interface ExamStartRequest {
  courseId: number
  knowledgePointIds?: number[]
}

export interface ExamQuestionItem {
  id: number
  knowledgePointId: number
  questionType: QuestionType
  content: string
  difficulty: Difficulty
}

export interface ExamStartResponse {
  questions: ExamQuestionItem[]
  totalCount: number
}

export interface AnswerItem {
  questionId: number
  userAnswer: string
}

export interface ExamSubmitRequest {
  courseId: number
  answers: AnswerItem[]
}

export interface RecordItem {
  questionId: number
  questionType: string
  score: number | null
  userAnswer: string
  correctAnswer: string
}

export interface ExamSubmitResponse {
  submitTime: string | null
  totalCount: number
  correctCount: number
  wrongCount: number
  ungradedCount: number
  records: RecordItem[]
}

export interface ExamRecordResponse {
  id: number
  courseId: number
  questionId: number
  questionType: string
  userAnswer: string
  correctAnswer: string
  score: number | null
  feedback: GradingFeedback | null
  createTime: string
}

export interface ExamRecordDetailResponse extends ExamRecordResponse {
  questionContent: string | null
  knowledgePointId: number | null
  knowledgePointName: string | null
  difficulty: Difficulty | null
}

export interface ExamSessionResponse {
  courseId: number
  submitTime: string
  totalCount: number
  correctCount: number
  wrongCount: number
  ungradedCount: number
  records: ExamRecordDetailResponse[]
}

// ==================== Grading ====================
export interface GradingFeedback {
  missingPoints: string[]
  suggestions: string[]
}

export interface GradingResultResponse {
  recordId: number
  questionType: string
  score: number
  feedback: GradingFeedback | null
}

// ==================== Wrong Question ====================
export interface WrongQuestionResponse {
  id: number
  questionId: number
  knowledgePointId: number
  questionType: string
  latestUserAnswer: string
  correctAnswer: string
  latestScore: number
  feedback: GradingFeedback | null
  wrongCount: number
  lastWrongTime: string
  createTime: string
}

export interface PracticeRequest {
  courseId: number
  knowledgePointIds?: number[]
}

// ==================== Statistics ====================
export interface TypeDistribution {
  questionType: string
  count: number
}

export interface StatisticsResponse {
  totalCount: number
  correctCount: number
  wrongCount: number
  ungradedCount: number
  accuracyRate: number
  typeDistribution: TypeDistribution[]
}

// ==================== Study Plan ====================
export interface GenerateStudyPlanRequest {
  courseId: number
  examDate: string // YYYY-MM-DD
}

export type StudyTaskType = 'KNOWLEDGE_POINT' | 'WRONG_QUESTION_REVIEW' | 'KEY_MEMORY'

export interface StudyTask {
  type: StudyTaskType
  knowledgePointId: number | null
  name: string
  masteryScore: number | null
  importance: number | null
  wrongCount: number | null
  knowledgePointNames: string[] | null
}

export interface DayPlan {
  dayNumber: number
  date: string
  tasks: StudyTask[]
}

export interface StudyPlanResponse {
  courseId: number
  examDate: string
  totalDays: number
  days: DayPlan[]
}

// ==================== RAG / Chat ====================
export interface ChatRequest {
  courseId: number
  conversationId?: number | null
  question: string
}

export interface ChatMessageVO {
  id: number
  role: 'user' | 'assistant'
  content: string
  references?: ReferenceVO[] | null
  createTime: string
}

export interface ChatHistoryResponse {
  courseId: number
  messages: ChatMessageVO[]
}

export interface RagConversationSummary {
  conversationId: number
  title: string
  updateTime: string
  messageCount: number
}

export interface ReferenceVO {
  title: string
  content: string
}

export interface SseEvent {
  type: 'content' | 'references' | 'status' | 'tool_call' | 'course_changed' | 'conversation' | 'error'
  content: string | null
  references: ReferenceVO[] | null
}

// ==================== Tutor ====================
export interface TutorStartSessionRequest {
  courseId: number
  maxRounds?: number
  knowledgePointIds?: number[]
}

export interface TutorKnowledgePointView {
  id: number
  name: string
  masteryScore: number | null
}

export interface TutorQuestionView {
  questionId: number
  questionType: string
  content: Record<string, unknown> | string | null
  difficulty: string
}

export interface TutorFeedbackView {
  missingPoints: string[]
  suggestions: string[]
}

export type TutorNextAction = 'FOLLOW_UP' | 'NEXT_KNOWLEDGE_POINT' | 'FINISHED'

export interface TutorSessionResponse {
  sessionId: string
  phase: string
  totalRounds: number
  maxRounds: number
  currentKnowledgePoint: TutorKnowledgePointView | null
  question: TutorQuestionView | null
  openingComment: string | null
}

export interface TutorTurnView {
  roundNumber: number
  knowledgePointId: number | null
  knowledgePointName: string | null
  question: TutorQuestionView | null
  userAnswer: string | null
  score: number | null
  tutorComment: string | null
  feedback: TutorFeedbackView | null
  followUp: boolean
}

export interface TutorSessionDetailResponse {
  session: TutorSessionResponse
  turns: TutorTurnView[]
}

export interface TutorSessionHistoryItem {
  sessionId: string
  courseId: number
  status: string
  totalRounds: number
  maxRounds: number
  avgScore: number | null
  memorySummary: string | null
  createTime: string
  endedTime: string | null
}

export interface TutorAnswerRequest {
  answer: string
}

export interface TutorChatRequest {
  message: string
}

export interface TutorSessionSummary {
  totalRounds: number
  avgScore: number
  strongPoints: string[]
  weakPoints: string[]
  encouragement: string
  suggestedActions: string[]
}

export interface TutorAnswerResponse {
  sessionId: string
  phase: string
  score: number | null
  feedback: TutorFeedbackView | null
  tutorComment: string | null
  masteryScore: number | null
  nextAction: TutorNextAction
  totalRounds: number
  question: TutorQuestionView | null
  closingComment: string | null
  sessionSummary: TutorSessionSummary | null
}

export interface TutorAnswerStreamEvent {
  type: 'status' | 'score' | 'comment' | 'feedback' | 'mastery' | 'next' | 'question' | 'closing' | 'summary' | 'done' | 'error'
  content?: string | null
  score?: number | null
  feedback?: TutorFeedbackView | null
  masteryScore?: number | null
  nextAction?: TutorNextAction | null
  phase?: string | null
  totalRounds?: number | null
  question?: TutorQuestionView | null
  currentKnowledgePoint?: TutorKnowledgePointView | null
  sessionSummary?: TutorSessionSummary | null
}
