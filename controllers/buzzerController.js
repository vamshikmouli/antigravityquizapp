import { TIME_LIMITS } from '../shared/constants.js';

/**
 * Buzzer state manager for a session
 */
export class BuzzerManager {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.active = false;
    this.locked = false;
    this.firstBuzzer = null;
    this.buzzerTimestamp = null;
    this.buzzerPresses = [];
    this.answerTimeout = null;
  }
  
  /**
   * Activate buzzer for current question
   */
  activate() {
    this.active = true;
    this.locked = false;
    this.firstBuzzer = null;
    this.buzzerTimestamp = null;
    this.buzzerPresses = [];
    
    if (this.answerTimeout) {
      clearTimeout(this.answerTimeout);
      this.answerTimeout = null;
    }
  }
  
  /**
   * Deactivate buzzer
   */
  deactivate() {
    this.active = false;
    this.locked = false;
    this.firstBuzzer = null;
    this.buzzerTimestamp = null;
    this.buzzerPresses = [];
    
    if (this.answerTimeout) {
      clearTimeout(this.answerTimeout);
      this.answerTimeout = null;
    }
  }
  
  /**
   * Handle buzzer press
   * Returns winner info if this is the first press, null otherwise
   */
  pressBuzzer(participantId, participantName, clientTimestamp) {
    const serverTimestamp = Date.now();
    
    // Ignore if buzzer is not active or already locked
    if (!this.active || this.locked) {
      return null;
    }
    
    // Record this press
    this.buzzerPresses.push({
      participantId,
      participantName,
      clientTimestamp,
      serverTimestamp
    });
    
    // If this is the first press, lock the buzzer
    if (!this.firstBuzzer) {
      this.firstBuzzer = {
        participantId,
        participantName,
        timestamp: serverTimestamp
      };
      this.buzzerTimestamp = serverTimestamp;
      this.locked = true;
      
      return this.firstBuzzer;
    }
    
    return null;
  }
  
  /**
   * Set answer timeout callback
   */
  setAnswerTimeout(callback, timeoutMs = TIME_LIMITS.BUZZER_ANSWER * 1000) {
    if (this.answerTimeout) {
      clearTimeout(this.answerTimeout);
    }
    
    this.answerTimeout = setTimeout(() => {
      callback();
      this.answerTimeout = null;
    }, timeoutMs);
  }
  
  /**
   * Clear answer timeout
   */
  clearAnswerTimeout() {
    if (this.answerTimeout) {
      clearTimeout(this.answerTimeout);
      this.answerTimeout = null;
    }
  }
  
  /**
   * Get buzzer state
   */
  getState() {
    return {
      active: this.active,
      locked: this.locked,
      firstBuzzer: this.firstBuzzer,
      buzzerTimestamp: this.buzzerTimestamp,
      totalPresses: this.buzzerPresses.length
    };
  }
  
  /**
   * Get all buzzer presses (for debugging/analytics)
   */
  getAllPresses() {
    return [...this.buzzerPresses];
  }
  
  /**
   * Reset for next question
   */
  reset() {
    this.deactivate();
  }
}

/**
 * Global buzzer manager storage
 * Maps sessionId to BuzzerManager instance
 */
const buzzerManagers = new Map();

/**
 * Get or create buzzer manager for a session
 */
export function getBuzzerManager(sessionId) {
  if (!buzzerManagers.has(sessionId)) {
    buzzerManagers.set(sessionId, new BuzzerManager(sessionId));
  }
  return buzzerManagers.get(sessionId);
}

/**
 * Remove buzzer manager for a session
 */
export function removeBuzzerManager(sessionId) {
  const manager = buzzerManagers.get(sessionId);
  if (manager) {
    manager.deactivate();
    buzzerManagers.delete(sessionId);
  }
}

/**
 * Clear all buzzer managers
 */
export function clearAllBuzzerManagers() {
  buzzerManagers.forEach(manager => manager.deactivate());
  buzzerManagers.clear();
}
