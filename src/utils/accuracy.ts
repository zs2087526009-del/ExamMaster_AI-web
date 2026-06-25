export interface AccuracyInput {
  totalCount: number
  correctCount: number
  ungradedCount: number
}

export interface AccuracyResult {
  /** 0–100 when有已批改题，否则 null */
  percent: number | null
  gradedCount: number
  totalCount: number
  /** 例如：已批改 8 / 总计 10 */
  label: string
}

/**
 * 统一正确率：满分题数 / 已批改题数（分母排除待批改）。
 * 与后端 StatisticsService 算法一致。
 */
export function calcAccuracy(input: AccuracyInput): AccuracyResult {
  const { totalCount, correctCount, ungradedCount } = input
  const gradedCount = Math.max(0, totalCount - ungradedCount)
  const percent = gradedCount > 0
    ? Math.round((correctCount / gradedCount) * 100)
    : null

  return {
    percent,
    gradedCount,
    totalCount,
    label: `已批改 ${gradedCount} / 总计 ${totalCount}`,
  }
}

export function formatAccuracyPercent(result: AccuracyResult): string {
  return result.percent !== null ? `${result.percent}%` : '—'
}
