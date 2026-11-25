/** Question types with display label, icon and colour class (t-<TYPE>). */
export const QUESTION_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice', short: 'MCQ', icon: '🔤' },
  { value: 'TRUE_FALSE', label: 'True / False', short: 'True/False', icon: '✅' },
  { value: 'BUZZER', label: 'Buzzer (options)', short: 'Buzzer', icon: '🔔' },
  { value: 'ORAL_BUZZER', label: 'Oral Buzzer', short: 'Oral buzzer', icon: '🎤' },
  { value: 'SHORT_ANSWER', label: 'Short Answer', short: 'Short answer', icon: '✍️' },
  { value: 'ORAL_OPEN', label: 'Oral Open', short: 'Oral', icon: '💬' }
];
export const TYPE_INFO = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t]));
export const typeInfo = (t) => TYPE_INFO[t] || { value: t, label: t, short: t, icon: '❓' };
export const LETTERS = 'ABCDEFGH';
