import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import controllers
import * as sessionController from './controllers/sessionController.js';
import * as questionController from './controllers/questionController.js';
import * as scoringController from './controllers/scoringController.js';
import * as analyticsController from './controllers/analyticsController.js';
import * as authController from './controllers/authController.js';
import { authenticateToken } from './middleware/authMiddleware.js';
import { getBuzzerManager, removeBuzzerManager } from './controllers/buzzerController.js';

// Import constants
import { SOCKET_EVENTS, SESSION_STATUS, QUESTION_TYPES } from './shared/constants.js';
import { calculateRankings, sanitizeStudentName } from './shared/utils.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://jnanaquizapp.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Store active sessions and their socket rooms
const activeSessions = new Map();

// ============================================================================
// REST API ROUTES
// ============================================================================

// Auth Routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateToken, authController.getMe);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session routes
app.post('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const { questionIds, settings } = req.body;
    const hostId = req.user.id;
    
    if (!questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    
    const session = await sessionController.createSession(hostId, questionIds, settings);
    res.json(session);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:code', async (req, res) => {
  try {
    const session = await sessionController.getSessionByCode(req.params.code);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await sessionController.deleteSession(req.params.id);
    removeBuzzerManager(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Question routes
app.get('/api/questions', authenticateToken, async (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      category: req.query.category,
      round: req.query.round ? parseInt(req.query.round) : undefined,
      ownerId: req.user.id // Only get my questions (plus public ones if we decide to implement that logic)
    };
    
    const questions = await questionController.getAllQuestions(filters);
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions', authenticateToken, async (req, res) => {
  try {
    const questionData = { ...req.body, ownerId: req.user.id };
    const question = await questionController.createQuestion(questionData);
    res.json(question);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/questions/:id', authenticateToken, async (req, res) => {
  try {
    // Ideally check ownership here too
    const question = await questionController.updateQuestion(req.params.id, req.body);
    res.json(question);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/questions/:id', authenticateToken, async (req, res) => {
  try {
    await questionController.deleteQuestion(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/import', authenticateToken, async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions must be an array' });
    }
    
    const result = await questionController.importQuestions(questions);
    res.json(result);
  } catch (error) {
    console.error('Error importing questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create sample questions (for testing)
app.post('/api/questions/sample', async (req, res) => {
  try {
    const result = await questionController.createSampleQuestions();
    res.json(result);
  } catch (error) {
    console.error('Error creating sample questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analytics routes
app.get('/api/analytics/:sessionId', async (req, res) => {
  try {
    const analytics = await analyticsController.getAnalytics(req.params.sessionId);
    
    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }
    
    res.json(analytics);
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics/:sessionId/export', async (req, res) => {
  try {
    const analyticsJson = await analyticsController.exportAnalytics(req.params.sessionId);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${req.params.sessionId}.json`);
    res.send(analyticsJson);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WEBSOCKET EVENT HANDLERS
// ============================================================================

io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // ========================================
  // SESSION MANAGEMENT
  // ========================================
  
  socket.on(SOCKET_EVENTS.JOIN_SESSION, async (data) => {
    try {
      const { code, name, role } = data; // role: 'host', 'student', 'display'
      
      // Get session
      const session = await sessionController.getSessionByCode(code);
      
      if (!session) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
        return;
      }
      
      // Check if session allows late join
      if (session.status === SESSION_STATUS.ACTIVE && !session.allowLateJoin && role === 'student') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session has already started' });
        return;
      }
      
      // Join socket room
      socket.join(session.code);
      socket.data.sessionCode = session.code;
      socket.data.sessionId = session.id;
      socket.data.role = role;
      
      // If student, create participant record
      if (role === 'student') {
        try {
          const sanitizedName = sanitizeStudentName(name);
          const participant = await sessionController.addParticipant(session.id, sanitizedName);
          
          socket.data.participantId = participant.id;
          socket.data.participantName = participant.name;
          
          // Notify everyone that a new participant joined
          io.to(session.code).emit(SOCKET_EVENTS.PARTICIPANT_JOINED, {
            participant: {
              id: participant.id,
              name: participant.name,
              score: participant.score
            }
          });
          
          // Send confirmation to student
          socket.emit(SOCKET_EVENTS.SESSION_JOINED, {
            session: {
              id: session.id,
              code: session.code,
              status: session.status
            },
            participant: {
              id: participant.id,
              name: participant.name
            }
          });
        } catch (error) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
          return;
        }
      } else {
        // Host or display joined
        socket.emit(SOCKET_EVENTS.SESSION_JOINED, {
          session: {
            id: session.id,
            code: session.code,
            status: session.status,
            currentQuestionIndex: session.currentQuestionIndex
          }
        });
      }
      
      // Send current participants list
      const participants = await sessionController.getParticipants(session.id);
      socket.emit('participants-list', { participants });
      
    } catch (error) {
      console.error('Error joining session:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to join session' });
    }
  });
  
  // ========================================
  // QUIZ CONTROL (Host only)
  // ========================================
  
  socket.on(SOCKET_EVENTS.START_QUIZ, async () => {
    try {
      const { sessionId, sessionCode, role } = socket.data;
      
      if (role !== 'host') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only host can start quiz' });
        return;
      }
      
      // Update session status
      await sessionController.updateSessionStatus(sessionId, SESSION_STATUS.ACTIVE);
      
      // Notify all clients
      io.to(sessionCode).emit(SOCKET_EVENTS.START_QUIZ, {
        timestamp: Date.now()
      });
      
      // Start first question
      setTimeout(() => {
        socket.emit('trigger-next-question');
      }, 1000);
      
    } catch (error) {
      console.error('Error starting quiz:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to start quiz' });
    }
  });
  
  socket.on(SOCKET_EVENTS.NEXT_QUESTION, async (data) => {
    try {
      const { sessionId, sessionCode, role } = socket.data;
      const { force } = data || {};
      
      if (role !== 'host') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only host can control questions' });
        return;
      }
      
      const session = await sessionController.getSessionById(sessionId);
      const nextIndex = session.currentQuestionIndex;
      
      if (nextIndex >= session.questions.length) {
        // Quiz completed
        await sessionController.updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);
        const analytics = await analyticsController.generateAnalytics(sessionId);
        io.to(sessionCode).emit(SOCKET_EVENTS.END_QUIZ, { message: 'Quiz completed!' });
        io.to(sessionCode).emit(SOCKET_EVENTS.ANALYTICS_READY, { analytics });
        return;
      }
      
      // Check for Round Change
      if (nextIndex > 0 && !force) {
        const currentQ = session.questions[nextIndex].question;
        const prevQ = session.questions[nextIndex - 1].question;
        
        if (currentQ.round > prevQ.round) {
          // Emit Round Ended event
           const participants = await sessionController.getParticipants(sessionId);
           const rankings = calculateRankings(participants);
           
           io.to(sessionCode).emit(SOCKET_EVENTS.ROUND_ENDED, {
             round: prevQ.round,
             nextRound: currentQ.round,
             leaderboard: rankings
           });
           return;
        }
      }
      
      // Get current question
      const sessionQuestion = session.questions[nextIndex];
      const question = sessionQuestion.question;
      
      // Update current question index
      await sessionController.updateCurrentQuestion(sessionId, nextIndex + 1);
      
      // Prepare question data
      const questionData = {
        id: question.id,
        text: question.text,
        type: question.type,
        options: question.options,
        points: question.points,
        negativePoints: question.negativePoints,
        timeLimit: question.timeLimit,
        round: question.round,
        questionNumber: nextIndex + 1,
        totalQuestions: session.questions.length
      };
      
      // Send question to all clients
      io.to(sessionCode).emit(SOCKET_EVENTS.QUESTION_STARTED, {
        question: questionData,
        startTime: Date.now()
      });
      
      // If buzzer question, activate buzzer
      if (question.type === QUESTION_TYPES.BUZZER) {
        const buzzerManager = getBuzzerManager(sessionId);
        buzzerManager.activate();
        
        io.to(sessionCode).emit(SOCKET_EVENTS.BUZZER_ACTIVATED, {
          questionId: question.id
        });
      }
      
    } catch (error) {
      console.error('Error moving to next question:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to load question' });
    }
  });

  socket.on(SOCKET_EVENTS.SHOW_RESULTS, async () => {
    try {
      const { sessionId, sessionCode, role } = socket.data;
      
      if (role !== 'host') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only host can show results' });
        return;
      }
      
      // Calculate specific question stats
      const session = await sessionController.getSessionById(sessionId);
      // The current question index is already advanced, so we look at index - 1
      const currentQIndex = session.currentQuestionIndex - 1;
      
      if (currentQIndex < 0) return;
      
      const currentQ = session.questions[currentQIndex].question;
      const participants = await sessionController.getParticipants(sessionId);
      
      let correctCount = 0;
      let incorrectCount = 0;
      const correctNames = [];
      const incorrectNames = [];
      
      participants.forEach(p => {
        // Find answer for this question
        // Note: We might need to optimize this query logic in a real app
        // For now, we fetch participants with answers
        const answer = p.answers.find(a => a.questionId === currentQ.id);
        if (answer) {
          if (answer.isCorrect) {
            correctCount++;
            correctNames.push(p.name);
          } else {
            incorrectCount++;
            incorrectNames.push(p.name);
          }
        }
      });
      
      io.to(sessionCode).emit(SOCKET_EVENTS.SHOW_RESULTS, {
        correctAnswer: currentQ.correctAnswer,
        correctCount,
        incorrectCount,
        correctNames,
        incorrectNames,
        totalAnswers: correctCount + incorrectCount,
        correctPercentage: (correctCount + incorrectCount) > 0 
          ? Math.round((correctCount / (correctCount + incorrectCount)) * 100) 
          : 0
      });
      
    } catch (error) {
       console.error('Error showing results:', error);
       socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to show results' });
    }
  });
  
  socket.on(SOCKET_EVENTS.END_QUIZ, async () => {
    try {
      const { sessionId, sessionCode, role } = socket.data;
      
      if (role !== 'host') {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only host can end quiz' });
        return;
      }
      
      await sessionController.updateSessionStatus(sessionId, SESSION_STATUS.COMPLETED);
      
      // Generate analytics
      const analytics = await analyticsController.generateAnalytics(sessionId);
      
      io.to(sessionCode).emit(SOCKET_EVENTS.END_QUIZ, {
        message: 'Quiz ended by host'
      });
      
      io.to(sessionCode).emit(SOCKET_EVENTS.ANALYTICS_READY, {
        analytics
      });
      
    } catch (error) {
      console.error('Error ending quiz:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to end quiz' });
    }
  });
  
  // ========================================
  // BUZZER HANDLING
  // ========================================
  
  socket.on(SOCKET_EVENTS.BUZZER_PRESS, async (data) => {
    try {
      const { sessionId, sessionCode, participantId, participantName } = socket.data;
      const { questionId, clientTimestamp } = data;
      
      if (!participantId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only students can press buzzer' });
        return;
      }
      
      const buzzerManager = getBuzzerManager(sessionId);
      const winner = buzzerManager.pressBuzzer(participantId, participantName, clientTimestamp);
      
      if (winner) {
        // This is the first buzzer!
        await scoringController.incrementBuzzerWins(participantId);
        
        // Notify everyone
        io.to(sessionCode).emit(SOCKET_EVENTS.BUZZER_WINNER, {
          winner: {
            participantId: winner.participantId,
            participantName: winner.participantName,
            timestamp: winner.timestamp
          },
          questionId
        });
        
        // Lock buzzer for others
        io.to(sessionCode).emit(SOCKET_EVENTS.BUZZER_LOCKED, {
          winnerId: winner.participantId
        });
        
        // Set timeout for answer
        buzzerManager.setAnswerTimeout(async () => {
          // Winner didn't answer in time, reopen question
          buzzerManager.deactivate();
          
          io.to(sessionCode).emit(SOCKET_EVENTS.BUZZER_TIMEOUT, {
            message: 'Buzzer winner did not answer in time. Question reopened to all.'
          });
        });
      }
      
    } catch (error) {
      console.error('Error handling buzzer press:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to process buzzer' });
    }
  });
  
  // ========================================
  // ANSWER SUBMISSION
  // ========================================
  
  socket.on(SOCKET_EVENTS.SUBMIT_ANSWER, async (data) => {
    try {
      const { sessionId, sessionCode, participantId } = socket.data;
      const { questionId, answer, timeToAnswer } = data;
      
      if (!participantId) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only students can submit answers' });
        return;
      }
      
      // Submit answer
      const result = await scoringController.submitAnswer(
        participantId,
        questionId,
        answer,
        timeToAnswer
      );
      
      // Clear buzzer timeout if this was a buzzer question
      const buzzerManager = getBuzzerManager(sessionId);
      if (buzzerManager.locked && buzzerManager.firstBuzzer?.participantId === participantId) {
        buzzerManager.clearAnswerTimeout();
      }
      
      // Send result to student
      socket.emit(SOCKET_EVENTS.ANSWER_RECEIVED, {
        isCorrect: result.isCorrect,
        points: result.points,
        correctAnswer: result.correctAnswer
      });
      
      // Update leaderboard
      const participants = await sessionController.getParticipants(sessionId);
      const rankings = calculateRankings(participants);
      
      io.to(sessionCode).emit(SOCKET_EVENTS.LEADERBOARD_UPDATE, {
        leaderboard: rankings
      });
      
    } catch (error) {
      console.error('Error submitting answer:', error);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    }
  });
  
  // ========================================
  // DISCONNECT
  // ========================================
  
  socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const { sessionCode, participantId, participantName, role } = socket.data;
    
    if (sessionCode && participantId && role === 'student') {
      // Notify others that participant left
      io.to(sessionCode).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
        participantId,
        participantName
      });
    }
  });
});

// ============================================================================
// SERVE FRONTEND ASSETS
// ============================================================================

const tvDistPath = path.resolve(__dirname, 'client-tv', 'dist');
const mobileDistPath = path.resolve(__dirname, 'client-mobile', 'dist');

// Middleware to log asset requests for debugging
app.use((req, res, next) => {
  if (req.path.includes('.')) {
    console.log(`[Asset] ${req.method} ${req.path}`);
  }
  next();
});

// 1. Explicitly serve assets for the Play screen
// Requests for /play/assets/... will be served from client-mobile/dist/assets
app.use('/play/assets', express.static(path.join(mobileDistPath, 'assets')));

// 2. Explicitly serve root assets (for the TV screen / Admin)
// Requests for /assets/... will be served from client-tv/dist/assets
app.use('/assets', express.static(path.join(tvDistPath, 'assets')));

// 3. Serve the Student Play screen at /play
app.get('/play', (req, res) => {
  res.sendFile(path.join(mobileDistPath, 'index.html'));
});

// 4. Handle sub-routes under /play (for client-side routing)
app.get('/play/*', (req, res) => {
  // If request has a file extension, it's a missing asset, don't fallback to index.html
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(mobileDistPath, 'index.html'));
});

// 5. Serve TV Display / Admin app at root
// This serves all other static files (like /favicon.ico) from the TV dist
app.use(express.static(tvDistPath, { index: false }));

// 6. Catch-all for TV Display / Admin app
app.get('*', (req, res) => {
  // Only serve index.html if it's not an API route and not a request for a static asset
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(tvDistPath, 'index.html'));
  } else if (!req.path.startsWith('/api')) {
    res.status(404).send('Not found');
  }
});

// ============================================================================
// START SERVER
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`🚀 Quiz App Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌐 CORS enabled for:`, allowedOrigins);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    prisma.$disconnect();
    process.exit(0);
  });
});
