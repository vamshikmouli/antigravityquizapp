import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
const { readFile, utils } = xlsx;
import { QUESTION_TYPES } from '../shared/constants.js';

const prisma = new PrismaClient();

/**
 * Import questions from Excel or CSV
 */
export async function importQuestions(filePath, ownerId, quizId) {
  try {
    const workbook = readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = utils.sheet_to_json(worksheet);

    console.log(`[Import] Processing ${data.length} rows. QuizId: ${quizId}`);
    if (data.length > 0) {
      console.log('[Import] Detected headers:', Object.keys(data[0]));
    }

    const questions = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // 1-indexed + header row

      try {
        // Validate required fields
        if (!row['Question Text']) throw new Error('Missing "Question Text"');
        if (!row['Type']) throw new Error('Missing "Type"');
        if (!row['Correct Answer']) throw new Error('Missing "Correct Answer"');

        // Parse options (Pipe separated)
        let options = [];
        if (row['Options']) {
          options = row['Options'].toString().split('|').map(o => o.trim()).filter(o => o);
        }

        // Validate type
        const typeRaw = row['Type']?.toString().trim().toUpperCase();
        const type = typeRaw === 'MCQ' ? QUESTION_TYPES.MULTIPLE_CHOICE : typeRaw;

        if (!Object.values(QUESTION_TYPES).includes(type)) {
          throw new Error(`Invalid type: ${type}. Must be MULTIPLE_CHOICE, BUZZER, TRUE_FALSE, or SHORT_ANSWER`);
        }

        // Prepare question data
        const questionData = {
          text: row['Question Text']?.toString() || '',
          type,
          options,
          optionImages: [], // Initialize mandatory array
          correctAnswer: row['Correct Answer']?.toString() || '',
          points: parseInt(row['Points']) || 100,
          negativePoints: parseInt(row['Negative Points']) || 0,
          timeLimit: parseInt(row['Time Limit']) || 30,
          readingTime: parseInt(row['Reading Time']) || 0,
          round: parseInt(row['Round']) || 1,
          category: row['Category'] ? row['Category'].toString() : 'General',
          ownerId,
          quizId
        };

        console.log(`[Import] Prepared question: ${questionData.text.substring(0, 30)}...`);
        questions.push(questionData);
      } catch (err) {
        console.error(`[Import] Error at row ${rowNum}:`, err.message);
        errors.push({ row: rowNum, error: err.message });
      }
    }

    if (questions.length === 0 && errors.length > 0) {
      throw new Error(`Import failed: ${errors[0].error} at row ${errors[0].row}`);
    }

    // Bulk create
    let createdCount = 0;
    if (questions.length > 0) {
      try {
        const result = await prisma.question.createMany({
          data: questions
        });
        createdCount = result.count;
        console.log(`[Import] Successfully created ${createdCount} questions`);
      } catch (dbError) {
        console.error('[Import] Database Error:', dbError);
        throw new Error(`Database error during bulk creation: ${dbError.message}`);
      }
    }

    return {
      success: true,
      count: createdCount,
      errors: errors.length > 0 ? errors : null
    };
  } catch (error) {
    console.error('Error importing questions:', error);
    throw error;
  }
}
