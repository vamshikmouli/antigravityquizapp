import { PrismaClient } from '@prisma/client';
import { calculateScoreChange } from '../shared/utils.js';
import { answersMatch } from './competition.js';

const prisma = new PrismaClient();

/**
 * Submit an answer
 */
export async function submitAnswer(participantId, questionId, answer, timeToAnswer = null) {
  try {
    // Get the question to check if answer is correct
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    });
    
    if (!question) {
      throw new Error('Question not found');
    }
    
    // Check if answer is correct
    // Typed answers ignore case, spacing and punctuation; option answers must match exactly.
    const isCorrect = question.type === 'SHORT_ANSWER'
      ? answersMatch(answer, question.correctAnswer)
      : answer === question.correctAnswer;
    
    // Calculate points
    const points = calculateScoreChange(isCorrect, question.points, question.negativePoints);
    
    // Create answer record
    const answerRecord = await prisma.answer.create({
      data: {
        participantId,
        questionId,
        answer,
        isCorrect,
        points,
        timeToAnswer
      }
    });
    
    // Update participant score
    await prisma.participant.update({
      where: { id: participantId },
      data: {
        score: {
          increment: points
        }
      }
    });
    
    return {
      answer: answerRecord,
      isCorrect,
      points,
      correctAnswer: question.correctAnswer
    };
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('Answer already submitted for this question');
    }
    console.error('Error submitting answer:', error);
    throw new Error('Failed to submit answer');
  }
}

/**
 * Update participant score (for buzzer wins, bonuses, etc.)
 */
export async function updateParticipantScore(participantId, scoreChange) {
  try {
    const participant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        score: {
          increment: scoreChange
        }
      }
    });
    
    return participant;
  } catch (error) {
    console.error('Error updating participant score:', error);
    throw new Error('Failed to update score');
  }
}

/**
 * Increment buzzer wins for a participant
 */
export async function incrementBuzzerWins(participantId) {
  try {
    const participant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        buzzerWins: {
          increment: 1
        }
      }
    });
    
    return participant;
  } catch (error) {
    console.error('Error incrementing buzzer wins:', error);
    throw new Error('Failed to increment buzzer wins');
  }
}

/**
 * Undo one buzzer win (host override). Never goes below zero.
 */
export async function decrementBuzzerWins(participantId) {
  try {
    const result = await prisma.participant.updateMany({
      where: { id: participantId, buzzerWins: { gt: 0 } },
      data: { buzzerWins: { decrement: 1 } }
    });
    return result.count;
  } catch (error) {
    console.error('Error decrementing buzzer wins:', error);
    throw new Error('Failed to decrement buzzer wins');
  }
}

/**
 * Get participant's answers
 */
export async function getParticipantAnswers(participantId) {
  try {
    const answers = await prisma.answer.findMany({
      where: { participantId },
      include: {
        question: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });
    
    return answers;
  } catch (error) {
    console.error('Error getting participant answers:', error);
    throw new Error('Failed to get answers');
  }
}

/**
 * Get answers for a specific question
 */
export async function getQuestionAnswers(questionId) {
  try {
    const answers = await prisma.answer.findMany({
      where: { questionId },
      include: {
        participant: true
      }
    });
    
    return answers;
  } catch (error) {
    console.error('Error getting question answers:', error);
    throw new Error('Failed to get question answers');
  }
}

/**
 * Calculate question statistics
 */
export async function getQuestionStats(questionId) {
  try {
    const answers = await getQuestionAnswers(questionId);
    
    if (answers.length === 0) {
      return {
        totalAnswers: 0,
        correctCount: 0,
        wrongCount: 0,
        correctPercentage: 0,
        averageTime: 0
      };
    }
    
    const correctCount = answers.filter(a => a.isCorrect).length;
    const wrongCount = answers.length - correctCount;
    const correctPercentage = Math.round((correctCount / answers.length) * 100);
    
    const timesWithValues = answers.filter(a => a.timeToAnswer !== null);
    const averageTime = timesWithValues.length > 0
      ? Math.round(timesWithValues.reduce((sum, a) => sum + a.timeToAnswer, 0) / timesWithValues.length)
      : 0;
    
    return {
      totalAnswers: answers.length,
      correctCount,
      wrongCount,
      correctPercentage,
      averageTime
    };
  } catch (error) {
    console.error('Error calculating question stats:', error);
    throw new Error('Failed to calculate question stats');
  }
}
