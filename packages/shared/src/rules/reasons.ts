/**
 * Keyword classification of "why did you not attend?" answers (ADR 0018).
 * This is the interim method until an AI classifier is added behind the same
 * interface; it is deterministic, explainable and runs offline.
 */
export const REASON_LABELS = {
  lessons_exams: 'Ders veya sınav',
  schedule_conflict: 'Zaman çakışması',
  health: 'Sağlık',
  transport: 'Ulaşım veya uzaklık',
  forgot: 'Unuttum',
  lost_interest: 'İlgimi kaybettim',
  work_family: 'İş veya aile',
  weather: 'Hava durumu',
  other: 'Diğer',
} as const;
export type ReasonLabel = keyof typeof REASON_LABELS;

/** Stems matched after Turkish lower-casing; the first label with a hit wins. */
const RULES: readonly [ReasonLabel, readonly string[]][] = [
  ['health', ['hasta', 'grip', 'ateş', 'doktor', 'hastane', 'rahatsız', 'ağrı', 'sağlık', 'ilaç']],
  [
    'lessons_exams',
    ['sınav', 'vize', 'final', 'ders', 'ödev', 'proje', 'quiz', 'laboratuvar', 'lab '],
  ],
  [
    'work_family',
    [
      'iş ',
      'işim',
      'işe ',
      'çalış',
      'mesai',
      'aile',
      'annem',
      'babam',
      'kardeş',
      'cenaze',
      'düğün',
    ],
  ],
  [
    'transport',
    ['ulaşım', 'otobüs', 'servis', 'trafik', 'uzak', 'metro', 'yol ', 'yolda', 'kaçırdım'],
  ],
  [
    'schedule_conflict',
    [
      'çakış',
      'saat',
      'aynı anda',
      'başka etkinlik',
      'randevu',
      'program',
      'yetişemedim',
      'geç kaldım',
    ],
  ],
  ['forgot', ['unut', 'aklımdan', 'hatırla']],
  ['weather', ['yağmur', 'kar ', 'kar yağ', 'hava', 'fırtına', 'soğuk']],
  [
    'lost_interest',
    ['ilgi', 'sıkıcı', 'istemedim', 'canım', 'vazgeç', 'değmez', 'beklediğim gibi'],
  ],
];

export function classifyReason(answer: string): ReasonLabel {
  // Padding lets stems with a trailing space ("iş ") also match at the end.
  const text = ` ${answer.toLocaleLowerCase('tr').replace(/\s+/g, ' ')} `;
  for (const [label, stems] of RULES) {
    if (stems.some((stem) => text.includes(stem))) return label;
  }
  return 'other';
}
