import type { DocumentResponse, KnowledgePointResponse } from '@/types'

export interface KpCascaderOption {
  value: number
  label: string
  children?: KpCascaderOption[]
}

export function groupKpsByDocument(
  kps: KnowledgePointResponse[],
  documents: DocumentResponse[],
): { documentId: number; label: string; kps: KnowledgePointResponse[] }[] {
  const byDoc = new Map<number, KnowledgePointResponse[]>()
  for (const kp of kps) {
    const list = byDoc.get(kp.documentId) ?? []
    list.push(kp)
    byDoc.set(kp.documentId, list)
  }
  const groups: { documentId: number; label: string; kps: KnowledgePointResponse[] }[] = []
  const seen = new Set<number>()
  for (const doc of documents) {
    const list = byDoc.get(doc.id)
    if (!list?.length) continue
    groups.push({ documentId: doc.id, label: doc.fileName, kps: list })
    seen.add(doc.id)
  }
  for (const [documentId, list] of byDoc) {
    if (seen.has(documentId)) continue
    groups.push({ documentId, label: `文档 #${documentId}`, kps: list })
  }
  return groups
}

/** Document → KP cascader options. Pass allowedKpIds to hide empty leaves. */
export function buildKpCascaderOptions(
  kps: KnowledgePointResponse[],
  documents: DocumentResponse[],
  allowedKpIds?: Set<number> | null,
): KpCascaderOption[] {
  const filtered = allowedKpIds ? kps.filter((kp) => allowedKpIds.has(kp.id)) : kps
  return groupKpsByDocument(filtered, documents).map((g) => ({
    value: g.documentId,
    label: g.label,
    children: g.kps.map((kp) => ({
      value: kp.id,
      label: `${kp.chapter} › ${kp.name}`,
    })),
  }))
}
