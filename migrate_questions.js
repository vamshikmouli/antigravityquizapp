import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log('Starting migration...');
    
    // 1. Get all users
    const users = await prisma.user.findMany();
    
    for (const user of users) {
      console.log(`Processing user: ${user.name || user.email}`);
      
      // 2. Check if user has orphaned questions
      const orphanedQuestions = await prisma.question.findMany({
        where: {
          ownerId: user.id,
          quizId: null
        }
      });
      
      if (orphanedQuestions.length > 0) {
        console.log(`Found ${orphanedQuestions.length} orphaned questions. Creating Default Quiz...`);
        
        // 3. Create a default quiz for them
        const defaultQuiz = await prisma.quiz.create({
          data: {
            title: 'My Master Quiz',
            description: 'Imported from previous version',
            ownerId: user.id
          }
        });
        
        // 4. Link questions to this quiz
        await prisma.question.updateMany({
          where: {
            id: { in: orphanedQuestions.map(q => q.id) }
          },
          data: {
            quizId: defaultQuiz.id
          }
        });
        
        console.log(`Migration complete for ${user.name || user.email}.`);
      }
    }
    
    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
