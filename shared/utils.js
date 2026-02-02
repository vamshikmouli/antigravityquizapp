import { SESSION_LIMITS } from './constants.js';

/**
 * Generate a unique session code
 * Format: ABC-123 (3 letters - 3 numbers)
 */
export function generateSessionCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let code = '';
  
  // Generate 3 random letters
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  code += '-';
  
  // Generate 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
}

/**
 * Format timestamp to readable time
 */
export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Calculate ranking from scores
 */
export function calculateRankings(participants) {
  // Sort by score descending, then by buzzer wins, then by join time
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.buzzerWins !== a.buzzerWins) return b.buzzerWins - a.buzzerWins;
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });
  
  return sorted.map((participant, index) => ({
    ...participant,
    rank: index + 1
  }));
}

/**
 * Validate session code format
 */
export function isValidSessionCode(code) {
  const pattern = /^[A-Z]{3}-[0-9]{3}$/;
  return pattern.test(code);
}

/**
 * Validate student name
 */
export function isValidStudentName(name) {
  return name && 
         typeof name === 'string' && 
         name.trim().length >= 2 && 
         name.trim().length <= 30;
}

/**
 * Sanitize student name
 */
export function sanitizeStudentName(name) {
  return name.trim().substring(0, 30);
}

/**
 * Calculate score change
 */
export function calculateScoreChange(isCorrect, points, negativePoints) {
  return isCorrect ? points : -negativePoints;
}

/**
 * Get leaderboard (top N participants)
 */
export function getLeaderboard(participants, limit = 10) {
  const ranked = calculateRankings(participants);
  return ranked.slice(0, limit);
}

/**
 * Calculate average score
 */
export function calculateAverageScore(participants) {
  if (participants.length === 0) return 0;
  const total = participants.reduce((sum, p) => sum + p.score, 0);
  return Math.round((total / participants.length) * 100) / 100;
}

/**
 * Get score distribution
 */
export function getScoreDistribution(participants) {
  const ranges = [
    { min: 0, max: 100, label: '0-100' },
    { min: 101, max: 200, label: '101-200' },
    { min: 201, max: 300, label: '201-300' },
    { min: 301, max: 400, label: '301-400' },
    { min: 401, max: 500, label: '401-500' },
    { min: 501, max: Infinity, label: '500+' }
  ];
  
  const distribution = ranges.map(range => ({
    label: range.label,
    count: participants.filter(p => p.score >= range.min && p.score <= range.max).length
  }));
  
  return distribution;
}

/**
 * Validate question format
 */
export function isValidQuestion(question) {
  if (!question.text || typeof question.text !== 'string') return false;
  
  const validTypes = ['MULTIPLE_CHOICE', 'BUZZER', 'TRUE_FALSE', 'SHORT_ANSWER'];
  if (!question.type || !validTypes.includes(question.type)) return false;
  
  // SHORT_ANSWER doesn't require options
  if (question.type !== 'SHORT_ANSWER') {
    if (!Array.isArray(question.options) || question.options.length < 2) return false;
    if (!question.correctAnswer || !question.options.includes(question.correctAnswer)) return false;
  } else {
    // SHORT_ANSWER requires a correctAnswer but options can be empty
    if (!question.correctAnswer) return false;
  }
  
  if (typeof question.points !== 'number' || question.points < 0) return false;
  if (typeof question.negativePoints !== 'number' || question.negativePoints < 0) return false;
  if (typeof question.timeLimit !== 'number' || question.timeLimit < 5) return false;
  if (question.readingTime !== undefined && (typeof question.readingTime !== 'number' || question.readingTime < 0)) return false;
  
  return true;
}
