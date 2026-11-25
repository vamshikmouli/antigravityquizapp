/** Question types with display label, icon and colour class (t-<TYPE>).
 *  `glyph` names an SVG icon (components/common/Icon.jsx); `icon` is a plain-text
 *  emoji kept for places that can only show text, such as <option> elements. */
export const QUESTION_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice', short: 'MCQ', icon: '🔤', glyph: 'list' },
  { value: 'TRUE_FALSE', label: 'True or false', short: 'True/False', icon: '✅', glyph: 'check-square' },
  { value: 'BUZZER', label: 'Buzzer with options', short: 'Buzzer', icon: '🔔', glyph: 'bell' },
  { value: 'ORAL_BUZZER', label: 'Oral buzzer', short: 'Oral buzzer', icon: '🎤', glyph: 'mic' },
  { value: 'SHORT_ANSWER', label: 'Short answer', short: 'Short answer', icon: '✍️', glyph: 'type' },
  { value: 'ORAL_OPEN', label: 'Oral open', short: 'Oral', icon: '💬', glyph: 'message' },
  { value: 'CLUE', label: 'Clue (reveal clues)', short: 'Clue', icon: '🧩', glyph: 'bulb' }
];
export const TYPE_INFO = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t]));
export const typeInfo = (t) => TYPE_INFO[t] || { value: t, label: t, short: t, icon: '❓', glyph: 'help' };
export const LETTERS = 'ABCDEFGH';
