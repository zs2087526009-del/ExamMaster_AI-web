const LETTER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export interface ParsedQuestionContent {
  stem: string
  options: Record<string, string> | null
}

/** 去掉选项文本里已有的 "A." / "A、" 等前缀，避免展示时重复 */
export function stripOptionPrefix(key: string, text: string): string {
  const trimmed = text.trim()
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = trimmed.replace(new RegExp(`^${escaped}[.、．:]\\s*`, 'i'), '')
  return stripped !== trimmed ? stripped.trim() : trimmed
}

export function normalizeOptions(raw: unknown): Record<string, string> | null {
  if (!raw) return null
  if (Array.isArray(raw)) {
    const obj: Record<string, string> = {}
    raw.forEach((text, i) => {
      const key = LETTER_LABELS[i] || String(i)
      obj[key] = stripOptionPrefix(key, String(text))
    })
    return obj
  }
  if (typeof raw === 'object') {
    const obj: Record<string, string> = {}
    for (const [key, text] of Object.entries(raw as Record<string, string>)) {
      obj[key] = stripOptionPrefix(key, String(text))
    }
    return obj
  }
  return null
}

export function parseQuestionContent(content: string | null | undefined): ParsedQuestionContent {
  if (!content) return { stem: '', options: null }
  try {
    const obj = JSON.parse(content)
    return {
      stem: obj.question || obj.stem || obj.title || content,
      options: normalizeOptions(obj.options),
    }
  } catch {
    return { stem: content, options: null }
  }
}

export function formatChoiceAnswer(
  answer: string,
  questionType: string,
  options: Record<string, string> | null,
): string {
  if (!answer) return '(未作答)'
  if (questionType !== 'CHOICE') return answer

  const num = Number(answer)
  if (!Number.isNaN(num) && LETTER_LABELS[num]) {
    const letter = LETTER_LABELS[num]
    const full = options?.[letter]
    return full ? `${letter}. ${full}` : letter
  }

  const full = options?.[answer]
  return full ? `${answer}. ${full}` : answer
}

export function optionKeys(opts: Record<string, string>): string[] {
  return Object.keys(opts).sort()
}
