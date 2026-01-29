// Question Types
export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  BUZZER: 'BUZZER',
  TRUE_FALSE: 'TRUE_FALSE',
  SHORT_ANSWER: 'SHORT_ANSWER'
};

// Session Status
export const SESSION_STATUS = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED'
};

// WebSocket Events
export const SOCKET_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Session Management
  CREATE_SESSION: 'create-session',
  JOIN_SESSION: 'join-session',
  LEAVE_SESSION: 'leave-session',
  SESSION_CREATED: 'session-created',
  SESSION_JOINED: 'session-joined',
  PARTICIPANT_JOINED: 'participant-joined',
  PARTICIPANT_LEFT: 'participant-left',
  
  // Quiz Control
  START_QUIZ: 'start-quiz',
  PAUSE_QUIZ: 'pause-quiz',
  RESUME_QUIZ: 'resume-quiz',
  NEXT_QUESTION: 'next-question',
  END_QUIZ: 'end-quiz',
  
  // Question Flow
  QUESTION_STARTED: 'question-started',
  QUESTION_ENDED: 'question-ended',
  ROUND_ENDED: 'round-ended',
  
  // Buzzer
  BUZZER_ACTIVATED: 'buzzer-activated',
  BUZZER_PRESS: 'buzzer-press',
  BUZZER_WINNER: 'buzzer-winner',
  BUZZER_LOCKED: 'buzzer-locked',
  BUZZER_TIMEOUT: 'buzzer-timeout',
  
  // Answers
  SUBMIT_ANSWER: 'submit-answer',
  ANSWER_RECEIVED: 'answer-received',
  SHOW_RESULTS: 'show-results',
  
  // Leaderboard
  LEADERBOARD_UPDATE: 'leaderboard-update',
  
  // Analytics
  ANALYTICS_READY: 'analytics-ready',
  
  // Errors
  ERROR: 'error'
};

// Scoring Rules
export const SCORING = {
  DEFAULT_POINTS: 100,
  DEFAULT_NEGATIVE: 25,
  MIN_POINTS: 10,
  MAX_POINTS: 1000
};

// Time Limits (in seconds)
export const TIME_LIMITS = {
  DEFAULT_QUESTION: 30,
  MIN_QUESTION: 5,
  MAX_QUESTION: 300,
  BUZZER_ANSWER: 10,
  COUNTDOWN_BEFORE_QUESTION: 3,
  RESULTS_DISPLAY: 5
};

// Session Limits
export const SESSION_LIMITS = {
  MAX_STUDENTS: 50,
  MIN_STUDENTS: 1,
  CODE_LENGTH: 6,
  MAX_QUESTIONS: 100
};

// Answer Options
export const ANSWER_OPTIONS = ['A', 'B', 'C', 'D'];

// Music/Sound Events
export const SOUND_EVENTS = {
  LOBBY_MUSIC: 'lobby-music',
  QUESTION_THEME: 'question-theme',
  BUZZER_SOUND: 'buzzer-sound',
  CORRECT_ANSWER: 'correct-answer',
  WRONG_ANSWER: 'wrong-answer',
  TIMER_WARNING: 'timer-warning',
  RESULTS_FANFARE: 'results-fanfare'
};
