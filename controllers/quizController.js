import { PrismaClient } from '@prisma/client';
import { ownerScope, tenantStamp } from './scope.js';
const prisma = new PrismaClient();

/**
 * Get all quizzes for the authenticated user
 */
export async function getAllQuizzes(req, res) {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: ownerScope(req.user),
      include: {
        _count: {
          select: { questions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(quizzes);
  } catch (error) {
    console.error('Get all quizzes error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
}

/**
 * Get a specific quiz with its questions
 */
export async function getQuiz(req, res) {
  try {
    const { id } = req.params;
    const quiz = await prisma.quiz.findFirst({
      where: { id, ...ownerScope(req.user) },
      include: {
        questions: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    res.json(quiz);
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
}

/**
 * Create a new quiz
 */
export async function createQuiz(req, res) {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title,
        description,
        ownerId: req.user.id,
        ...tenantStamp(req.user)
      }
    });

    res.status(201).json(quiz);
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
}

/**
 * Update an existing quiz
 */
export async function updateQuiz(req, res) {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    const existingQuiz = await prisma.quiz.findFirst({
      where: { id, ...ownerScope(req.user) }
    });

    if (!existingQuiz) {
      return res.status(404).json({ error: 'Quiz not found or unauthorized' });
    }

    const updatedQuiz = await prisma.quiz.update({
      where: { id },
      data: { title, description }
    });

    res.json(updatedQuiz);
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
}

/**
 * Delete a quiz and its questions
 */
export async function deleteQuiz(req, res) {
  try {
    const { id } = req.params;

    const existingQuiz = await prisma.quiz.findFirst({
      where: { id, ...ownerScope(req.user) }
    });

    if (!existingQuiz) {
      return res.status(404).json({ error: 'Quiz not found or unauthorized' });
    }

    await prisma.quiz.delete({
      where: { id }
    });

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
}

/**
 * Import questions from another quiz
 */
export async function importQuestionsFromQuiz(req, res) {
  try {
    const { id: targetQuizId } = req.params;
    const { sourceQuizId } = req.body;

    if (!sourceQuizId) {
      return res.status(400).json({ error: 'Source quiz ID is required' });
    }

    // 1. Verify target quiz ownership
    const targetQuiz = await prisma.quiz.findFirst({
      where: { id: targetQuizId, ...ownerScope(req.user) }
    });

    if (!targetQuiz) {
      return res.status(404).json({ error: 'Target quiz not found or unauthorized' });
    }

    // 1b. Verify SOURCE quiz ownership too — a caller must not be able to copy
    // another owner's (or tenant's) questions by guessing a quiz id.
    const sourceQuiz = await prisma.quiz.findFirst({
      where: { id: sourceQuizId, ...ownerScope(req.user) }
    });

    if (!sourceQuiz) {
      return res.status(404).json({ error: 'Source quiz not found or unauthorized' });
    }

    // 2. Fetch source questions (scoped to the caller as defense-in-depth)
    const sourceQuestions = await prisma.question.findMany({
      where: { quizId: sourceQuizId, ...ownerScope(req.user) }
    });

    if (sourceQuestions.length === 0) {
      return res.status(400).json({ error: 'Source quiz has no questions' });
    }

    // 3. Prepare duplicated questions (stripping IDs)
    const newQuestions = sourceQuestions.map(q => {
      const { id, createdAt, updatedAt, ...rest } = q;
      return {
        ...rest,
        quizId: targetQuizId,
        ownerId: req.user.id, // Ensure ownership
        ...tenantStamp(req.user)
      };
    });

    // 4. Bulk create
    const result = await prisma.question.createMany({
      data: newQuestions
    });

    res.json({ 
      message: `Successfully imported ${result.count} questions`,
      count: result.count 
    });
  } catch (error) {
    console.error('Import from quiz error:', error);
    res.status(500).json({ error: 'Failed to import questions' });
  }
}

