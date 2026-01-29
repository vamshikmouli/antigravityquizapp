import { PrismaClient } from '@prisma/client';
import { generateSessionCode, isValidSessionCode } from '../shared/utils.js';
import { SESSION_STATUS } from '../shared/constants.js';

const prisma = new PrismaClient();

/**
 * Create a new quiz session
 */
export async function createSession(hostId, questionIds, settings = {}) {
  try {
    // Generate unique session code
    let code;
    let isUnique = false;
    
    while (!isUnique) {
      code = generateSessionCode();
      const existing = await prisma.session.findUnique({ where: { code } });
      if (!existing) isUnique = true;
    }
    
    // Create session
    const session = await prisma.session.create({
      data: {
        code,
        hostId,
        musicEnabled: settings.musicEnabled ?? true,
        showLiveResults: settings.showLiveResults ?? true,
        allowLateJoin: settings.allowLateJoin ?? false,
        questions: {
          create: questionIds.map((questionId, index) => ({
            questionId,
            order: index
          }))
        }
      },
      include: {
        questions: {
          include: {
            question: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        participants: true
      }
    });
    
    return session;
  } catch (error) {
    console.error('Error creating session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Get session by code
 */
export async function getSessionByCode(code) {
  try {
    const session = await prisma.session.findUnique({
      where: { code },
      include: {
        questions: {
          include: {
            question: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        participants: {
          include: {
            answers: true
          }
        }
      }
    });
    
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    throw new Error('Failed to get session');
  }
}

/**
 * Get session by ID
 */
export async function getSessionById(id) {
  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            question: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        participants: {
          include: {
            answers: true
          }
        }
      }
    });
    
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    throw new Error('Failed to get session');
  }
}

/**
 * Add participant to session
 */
export async function addParticipant(sessionId, name) {
  try {
    const participant = await prisma.participant.create({
      data: {
        sessionId,
        name
      }
    });
    
    return participant;
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('A participant with this name already exists in this session');
    }
    console.error('Error adding participant:', error);
    throw new Error('Failed to add participant');
  }
}

/**
 * Remove participant from session
 */
export async function removeParticipant(participantId) {
  try {
    await prisma.participant.delete({
      where: { id: participantId }
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    throw new Error('Failed to remove participant');
  }
}

/**
 * Update session status
 */
export async function updateSessionStatus(sessionId, status) {
  try {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { 
        status,
        ...(status === SESSION_STATUS.COMPLETED ? { completedAt: new Date() } : {})
      }
    });
    
    return session;
  } catch (error) {
    console.error('Error updating session status:', error);
    throw new Error('Failed to update session status');
  }
}

/**
 * Update current question index
 */
export async function updateCurrentQuestion(sessionId, questionIndex) {
  try {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { currentQuestionIndex: questionIndex }
    });
    
    return session;
  } catch (error) {
    console.error('Error updating current question:', error);
    throw new Error('Failed to update current question');
  }
}

/**
 * Delete session
 */
export async function deleteSession(sessionId) {
  try {
    await prisma.session.delete({
      where: { id: sessionId }
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    throw new Error('Failed to delete session');
  }
}

/**
 * Get all participants for a session
 */
export async function getParticipants(sessionId) {
  try {
    const participants = await prisma.participant.findMany({
      where: { sessionId },
      include: {
        answers: true
      },
      orderBy: {
        score: 'desc'
      }
    });
    
    return participants;
  } catch (error) {
    console.error('Error getting participants:', error);
    throw new Error('Failed to get participants');
  }
}
