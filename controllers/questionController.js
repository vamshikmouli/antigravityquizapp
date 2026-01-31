import { PrismaClient } from '@prisma/client';
import { isValidQuestion } from '../shared/utils.js';
import { QUESTION_TYPES } from '../shared/constants.js';

const prisma = new PrismaClient();

/**
 * Create a new question
 */
export async function createQuestion(questionData) {
  try {
    if (!isValidQuestion(questionData)) {
      throw new Error('Invalid question format');
    }
    
    const question = await prisma.question.create({
      data: questionData
    });
    
    return question;
  } catch (error) {
    console.error('Error creating question:', error);
    throw new Error('Failed to create question');
  }
}

/**
 * Get all questions
 */
export async function getAllQuestions(filters = {}) {
  try {
    const where = {};
    
    if (filters.type) {
      where.type = filters.type;
    }
    
    if (filters.category) {
      where.category = filters.category;
    }
    
    if (filters.round) {
      where.round = filters.round;
    }

    if (filters.ownerId) {
      where.ownerId = filters.ownerId;
    }

    if (filters.quizId) {
      where.quizId = filters.quizId;
    }
    
    const questions = await prisma.question.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return questions;
  } catch (error) {
    console.error('Error getting questions:', error);
    throw new Error('Failed to get questions');
  }
}

/**
 * Get question by ID
 */
export async function getQuestionById(id) {
  try {
    const question = await prisma.question.findUnique({
      where: { id }
    });
    
    return question;
  } catch (error) {
    console.error('Error getting question:', error);
    throw new Error('Failed to get question');
  }
}

/**
 * Update question
 */
export async function updateQuestion(id, questionData) {
  try {
    if (!isValidQuestion(questionData)) {
      throw new Error('Invalid question format');
    }
    
    const question = await prisma.question.update({
      where: { id },
      data: questionData
    });
    
    return question;
  } catch (error) {
    console.error('Error updating question:', error);
    throw new Error('Failed to update question');
  }
}

/**
 * Delete question
 */
export async function deleteQuestion(id) {
  try {
    await prisma.question.delete({
      where: { id }
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    throw new Error('Failed to delete question');
  }
}

/**
 * Bulk import questions
 */
export async function importQuestions(questionsArray) {
  try {
    const validQuestions = questionsArray.filter(q => isValidQuestion(q));
    
    if (validQuestions.length === 0) {
      throw new Error('No valid questions to import');
    }
    
    const questions = await prisma.question.createMany({
      data: validQuestions
    });
    
    return questions;
  } catch (error) {
    console.error('Error importing questions:', error);
    throw new Error('Failed to import questions');
  }
}

/**
 * Get questions by IDs
 */
export async function getQuestionsByIds(ids) {
  try {
    const questions = await prisma.question.findMany({
      where: {
        id: {
          in: ids
        }
      }
    });
    
    return questions;
  } catch (error) {
    console.error('Error getting questions by IDs:', error);
    throw new Error('Failed to get questions');
  }
}

/**
 * Create sample questions for testing
 */
export async function createSampleQuestions() {
  const sampleQuestions = [
    {
      text: 'What is the capital of France?',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      options: ['London', 'Paris', 'Berlin', 'Madrid'],
      correctAnswer: 'Paris',
      points: 100,
      negativePoints: 25,
      timeLimit: 30,
      round: 1,
      category: 'Geography'
    },
    {
      text: 'Which planet is known as the Red Planet?',
      type: QUESTION_TYPES.BUZZER,
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      correctAnswer: 'Mars',
      points: 150,
      negativePoints: 30,
      timeLimit: 20,
      round: 1,
      category: 'Science'
    },
    {
      text: 'What is 2 + 2?',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      options: ['3', '4', '5', '6'],
      correctAnswer: '4',
      points: 50,
      negativePoints: 10,
      timeLimit: 15,
      round: 1,
      category: 'Math'
    },
    {
      text: 'The Earth is flat.',
      type: QUESTION_TYPES.TRUE_FALSE,
      options: ['True', 'False'],
      correctAnswer: 'False',
      points: 75,
      negativePoints: 15,
      timeLimit: 20,
      round: 1,
      category: 'Science'
    },
    {
      text: 'Who wrote "Romeo and Juliet"?',
      type: QUESTION_TYPES.BUZZER,
      options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
      correctAnswer: 'William Shakespeare',
      points: 200,
      negativePoints: 40,
      timeLimit: 25,
      round: 2,
      category: 'Literature'
    }
  ];
  
  try {
    const questions = await prisma.question.createMany({
      data: sampleQuestions,
      skipDuplicates: true
    });
    
    return questions;
  } catch (error) {
    console.error('Error creating sample questions:', error);
    throw new Error('Failed to create sample questions');
  }
}
