import { PrismaClient } from '@prisma/client';
import { 
  calculateAverageScore, 
  getScoreDistribution, 
  calculateRankings 
} from '../shared/utils.js';
import { getQuestionStats } from './scoringController.js';

const prisma = new PrismaClient();

/**
 * Generate analytics for a session
 */
export async function generateAnalytics(sessionId) {
  try {
    // Get session with all data
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            answers: {
              include: {
                question: true
              }
            }
          }
        },
        questions: {
          include: {
            question: true
          },
          orderBy: {
            order: 'asc'
          }
        }
      }
    });
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Calculate overall statistics
    const totalStudents = session.participants.length;
    const averageScore = calculateAverageScore(session.participants);
    const scoreDistribution = getScoreDistribution(session.participants);
    
    // Get top performers
    const rankedParticipants = calculateRankings(session.participants);
    const topPerformers = rankedParticipants.slice(0, 10).map(p => ({
      name: p.name,
      score: p.score,
      rank: p.rank,
      buzzerWins: p.buzzerWins
    }));
    
    // Calculate question-level statistics
    const questionStats = await Promise.all(
      session.questions.map(async (sq) => {
        const stats = await getQuestionStats(sq.questionId);
        
        // Get buzzer-specific stats if it's a buzzer question
        let buzzerStats = null;
        if (sq.question.type === 'BUZZER') {
          const buzzerAnswers = await prisma.answer.findMany({
            where: { questionId: sq.questionId },
            orderBy: { timestamp: 'asc' }
          });
          
          if (buzzerAnswers.length > 0) {
            const firstAnswer = buzzerAnswers[0];
            const buzzerWinner = await prisma.participant.findUnique({
              where: { id: firstAnswer.participantId }
            });
            
            buzzerStats = {
              winner: buzzerWinner?.name,
              fastestTime: firstAnswer.timeToAnswer,
              buzzerAccuracy: firstAnswer.isCorrect
            };
          }
        }
        
        return {
          questionId: sq.questionId,
          questionText: sq.question.text,
          type: sq.question.type,
          ...stats,
          buzzerStats
        };
      })
    );
    
    // Calculate overall buzzer statistics
    const buzzerQuestions = session.questions.filter(sq => sq.question.type === 'BUZZER');
    let overallBuzzerStats = {
      totalBuzzerQuestions: buzzerQuestions.length,
      fastestBuzz: null,
      averageBuzzTime: 0,
      buzzerAccuracy: 0
    };
    
    if (buzzerQuestions.length > 0) {
      const buzzerAnswers = await prisma.answer.findMany({
        where: {
          questionId: {
            in: buzzerQuestions.map(q => q.questionId)
          }
        },
        include: {
          participant: true
        },
        orderBy: {
          timestamp: 'asc'
        }
      });
      
      // Get first answer for each buzzer question
      const firstBuzzes = [];
      const questionIds = new Set();
      
      for (const answer of buzzerAnswers) {
        if (!questionIds.has(answer.questionId)) {
          questionIds.add(answer.questionId);
          if (answer.timeToAnswer !== null) {
            firstBuzzes.push(answer);
          }
        }
      }
      
      if (firstBuzzes.length > 0) {
        const fastestBuzz = Math.min(...firstBuzzes.map(a => a.timeToAnswer));
        const averageBuzzTime = Math.round(
          firstBuzzes.reduce((sum, a) => sum + a.timeToAnswer, 0) / firstBuzzes.length
        );
        const correctBuzzes = firstBuzzes.filter(a => a.isCorrect).length;
        const buzzerAccuracy = Math.round((correctBuzzes / firstBuzzes.length) * 100);
        
        overallBuzzerStats = {
          totalBuzzerQuestions: buzzerQuestions.length,
          fastestBuzz,
          averageBuzzTime,
          buzzerAccuracy
        };
      }
    }
    
    // Calculate detailed results for ALL participants
    const detailedResults = rankedParticipants.map(participant => {
      const roundScores = {};
      
      // Group answers by round and sum points
      participant.answers.forEach(answer => {
        const round = answer.question.round || 1;
        roundScores[round] = (roundScores[round] || 0) + answer.points;
      });
      
      return {
        id: participant.id,
        name: participant.name,
        totalScore: participant.score,
        rank: participant.rank,
        buzzerWins: participant.buzzerWins,
        roundScores
      };
    });
    
    // Create or update analytics record
    const analyticsData = {
      sessionId,
      totalStudents,
      averageScore,
      questionStats,
      topPerformers,
      detailedResults, // New field for all results
      scoreDistribution,
      buzzerStats: overallBuzzerStats
    };
    
    const analytics = await prisma.analytics.upsert({
      where: { sessionId },
      update: analyticsData,
      create: analyticsData
    });
    
    return analytics;
  } catch (error) {
    console.error('Error generating analytics:', error);
    throw new Error('Failed to generate analytics');
  }
}

/**
 * Get analytics for a session
 */
export async function getAnalytics(sessionId) {
  try {
    const analytics = await prisma.analytics.findUnique({
      where: { sessionId }
    });
    
    return analytics;
  } catch (error) {
    console.error('Error getting analytics:', error);
    throw new Error('Failed to get analytics');
  }
}

/**
 * Export analytics as JSON
 */
export async function exportAnalytics(sessionId) {
  try {
    const analytics = await getAnalytics(sessionId);
    
    if (!analytics) {
      throw new Error('Analytics not found');
    }
    
    return JSON.stringify(analytics, null, 2);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    throw new Error('Failed to export analytics');
  }
}
