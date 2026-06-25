/**
 * ExamMaster icon set — stroke glyphs inspired by scholarly celadon aesthetics.
 * Geometric, ink-brush weight, no emoji / generic AI iconography.
 */

export type IconName =
  | 'dashboard'
  | 'book'
  | 'tree'
  | 'scroll'
  | 'quill'
  | 'clipboard'
  | 'chart'
  | 'dialogue'
  | 'seal'
  | 'upload'
  | 'folder'
  | 'inbox'
  | 'complete'
  | 'plus'
  | 'user'
  | 'calendar'

export interface IconDef {
  paths: string[]
  fills?: string[]
}

export const icons: Record<IconName, IconDef> = {
  dashboard: {
    paths: [
      'M4.5 4.5h6.5v6.5H4.5z',
      'M13 4.5h6.5v6.5H13z',
      'M4.5 13h6.5v6.5H4.5z',
      'M13 13h6.5v6.5H13z',
    ],
  },
  book: {
    paths: [
      'M12 5v15',
      'M6.5 6.5C6.5 5.5 8.5 4.5 12 4.5c3.5 0 5.5 1 5.5 2v12c0 1-2 2-5.5 2S6.5 19.5 6.5 18.5V6.5z',
      'M6.5 6.5c2 1 3.8 1.5 5.5 1.5S15 7.5 17.5 6.5',
    ],
  },
  tree: {
    paths: [
      'M12 3.5v4',
      'M7.5 11c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5',
      'M9 11h6',
      'M10 11v2.5c0 1.5 0.9 2.5 2 2.5s2-1 2-2.5V11',
      'M8 18.5h8',
    ],
  },
  scroll: {
    paths: [
      'M7 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
      'M9 9.5h6',
      'M9 12.5h6',
      'M9 15.5h4',
      'M5.5 7.5c-1 .5-1.5 1.2-1.5 2',
      'M18.5 7.5c1 .5 1.5 1.2 1.5 2',
    ],
  },
  quill: {
    paths: [
      'M4.5 19.5h15',
      'M7.5 17.5l8.5-8.5 2 2-8.5 8.5H7.5v-2z',
      'M15.5 8.5l1.5-1.5 1.5 1.5-1.5 1.5z',
    ],
  },
  clipboard: {
    paths: [
      'M9.5 4.5h5v2.5h-5z',
      'M8 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
      'M10 11.5h4',
      'M10 14.5h4',
      'M10 17.5h2.5',
    ],
  },
  chart: {
    paths: [
      'M4.5 19.5V4.5',
      'M4.5 19.5h15',
      'M8 16.5V11',
      'M12 16.5V7.5',
      'M16 16.5v-4',
    ],
  },
  dialogue: {
    paths: [
      'M5.5 6.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3h-4.5L7.5 18v-3.5H8.5a3 3 0 0 1-3-3V6.5z',
      'M9.5 9h5',
      'M9.5 12h3',
    ],
  },
  seal: {
    paths: [
      'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
      'M9.5 9.5h5v5h-5z',
    ],
  },
  upload: {
    paths: [
      'M12 5v8.5',
      'M8.5 10L12 6.5 15.5 10',
      'M5.5 18.5h13',
      'M7.5 15.5h9',
    ],
  },
  folder: {
    paths: [
      'M4.5 7.5h5.5l2 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2z',
    ],
  },
  inbox: {
    paths: [
      'M3.5 8.5 6.5 5h11l3 3.5v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z',
      'M3.5 8.5h6.5l2 2.5h9',
    ],
  },
  complete: {
    paths: [
      'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z',
      'M8.5 12l2.5 2.5 4.5-5',
    ],
  },
  plus: {
    paths: ['M12 6v12', 'M6 12h12'],
  },
  user: {
    paths: [
      'M12 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
      'M5.5 19c0-3 2.9-5.5 6.5-5.5s6.5 2.5 6.5 5.5',
    ],
  },
  calendar: {
    paths: [
      'M8 4.5V7.5',
      'M16 4.5V7.5',
      'M4.5 9.5h15',
      'M5 6h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5V7.5A1.5 1.5 0 0 1 5 6z',
      'M8.5 13h1.5',
      'M12 13h1.5',
      'M8.5 16.5h1.5',
      'M12 16.5h1.5',
      'M15.5 13h1.5',
    ],
  },
}
