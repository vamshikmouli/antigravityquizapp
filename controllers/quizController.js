import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Get all quizzes for the authenticated user
 */
export async function getAllQuizzes(req, res) {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { ownerId: req.user.id },
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
      where: { 
        id,
        ownerId: req.user.id 
      },
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
        ownerId: req.user.id
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
      where: { id, ownerId: req.user.id }
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
      where: { id, ownerId: req.user.id }
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
