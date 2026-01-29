# Quiz App Backend

Interactive quiz application backend with WebSocket support for real-time quiz sessions.

## Features

- ✅ Real-time WebSocket communication
- ✅ Session management with unique join codes
- ✅ Multiple question types (Multiple Choice, Buzzer, True/False)
- ✅ Precise buzzer timing logic
- ✅ Scoring with positive and negative marking
- ✅ Live leaderboard updates
- ✅ Comprehensive analytics
- ✅ PostgreSQL database with Prisma ORM

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

## Installation

1. **Clone and navigate to project:**
   ```bash
   cd d:/Apps/antigravityquizapp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Update `DATABASE_URL` with your PostgreSQL credentials:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/quizapp
     ```

4. **Set up database:**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. **Create sample questions (optional):**
   ```bash
   curl -X POST http://localhost:3000/api/questions/sample
   ```

## Running the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server will start on `http://localhost:3000`

## API Endpoints

### Sessions
- `POST /api/sessions` - Create new quiz session
- `GET /api/sessions/:code` - Get session by code
- `DELETE /api/sessions/:id` - Delete session

### Questions
- `GET /api/questions` - Get all questions (with optional filters)
- `POST /api/questions` - Create new question
- `PUT /api/questions/:id` - Update question
- `DELETE /api/questions/:id` - Delete question
- `POST /api/questions/import` - Bulk import questions
- `POST /api/questions/sample` - Create sample questions

### Analytics
- `GET /api/analytics/:sessionId` - Get session analytics
- `GET /api/analytics/:sessionId/export` - Export analytics as JSON

## WebSocket Events

### Client → Server
- `join-session` - Join a quiz session
- `start-quiz` - Start the quiz (host only)
- `next-question` - Move to next question (host only)
- `end-quiz` - End the quiz (host only)
- `buzzer-press` - Press buzzer (students only)
- `submit-answer` - Submit answer (students only)

### Server → Client
- `session-joined` - Confirmation of joining
- `participant-joined` - New participant joined
- `participant-left` - Participant left
- `question-started` - New question started
- `buzzer-activated` - Buzzer is now active
- `buzzer-winner` - First buzzer press detected
- `buzzer-locked` - Buzzer locked for others
- `answer-received` - Answer submission confirmed
- `leaderboard-update` - Updated rankings
- `analytics-ready` - Final analytics available
- `error` - Error occurred

## Database Schema

See `prisma/schema.prisma` for complete schema.

**Main Models:**
- `Question` - Quiz questions with options and correct answers
- `Session` - Quiz sessions with settings
- `Participant` - Students in a session
- `Answer` - Student answers with scoring
- `Analytics` - Session statistics

## Project Structure

```
antigravityquizapp/
├── controllers/          # Business logic
│   ├── sessionController.js
│   ├── questionController.js
│   ├── scoringController.js
│   ├── analyticsController.js
│   └── buzzerController.js
├── prisma/
│   └── schema.prisma    # Database schema
├── shared/              # Shared utilities
│   ├── constants.js
│   └── utils.js
├── server.js            # Main server file
├── package.json
└── .env                 # Environment variables
```

## Prisma Commands

**View database in browser:**
```bash
npm run prisma:studio
```

**Create new migration:**
```bash
npx prisma migrate dev --name migration_name
```

**Reset database:**
```bash
npx prisma migrate reset
```

## Testing

You can test the API using curl or Postman:

**Create a session:**
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "hostId": "host-123",
    "questionIds": ["question-id-1", "question-id-2"],
    "settings": {
      "musicEnabled": true,
      "showLiveResults": true
    }
  }'
```

**Get all questions:**
```bash
curl http://localhost:3000/api/questions
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `NODE_ENV` | Environment (development/production) | development |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:5173 |
| `SESSION_CODE_LENGTH` | Length of session codes | 6 |
| `MAX_STUDENTS_PER_SESSION` | Maximum students per session | 50 |
| `BUZZER_TIMEOUT_MS` | Buzzer answer timeout | 10000 |

## Troubleshooting

**Database connection error:**
- Ensure PostgreSQL is running
- Check DATABASE_URL in `.env`
- Verify database exists

**Port already in use:**
- Change PORT in `.env`
- Or kill process using port 3000

**Prisma errors:**
- Run `npx prisma generate`
- Check schema.prisma syntax
- Ensure migrations are up to date

## Next Steps

- [ ] Build frontend TV display interface
- [ ] Build frontend mobile student interface
- [ ] Build frontend host control panel
- [ ] Add audio/music support
- [ ] Deploy to production

## License

MIT
