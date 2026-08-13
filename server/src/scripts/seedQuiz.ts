import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const roundDefinitions = [
  { name: "Computer & IT Basics", pointValue: 1 },
  { name: "Internet, Web & Digital World", pointValue: 1 },
  { name: "Programming & Logic", pointValue: 2 },
  { name: "Cybersecurity, AI & Modern IT", pointValue: 2 },
  { name: "The Hackathon Challenge", pointValue: 3 },
];

function getQuestionBlocks(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const pattern =
    /Q(\d+)\.\s*(.*?)\s*A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*✅\s*Answer:\s*([A-D])/g;
  const matches = [...normalized.matchAll(pattern)];
  return matches.map((match) => ({
    questionNumber: Number(match[1]),
    questionText: match[2].trim(),
    optionA: match[3].trim(),
    optionB: match[4].trim(),
    optionC: match[5].trim(),
    optionD: match[6].trim(),
    correctAnswer: match[7].trim(),
  }));
}

function validateQuestions(
  blocks: Array<{
    questionNumber: number;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: string;
  }>,
) {
  if (blocks.length !== 100) {
    throw new Error(`Expected 100 questions, got ${blocks.length}`);
  }

  const numbers = blocks.map((block) => block.questionNumber);
  const unique = new Set(numbers);
  if (unique.size !== 100 || numbers[0] !== 1 || numbers[99] !== 100) {
    throw new Error("Question numbering is invalid or incomplete");
  }

  for (const block of blocks) {
    if (
      !block.questionText ||
      !block.optionA ||
      !block.optionB ||
      !block.optionC ||
      !block.optionD
    ) {
      throw new Error(
        `Question ${block.questionNumber} is missing text or an option`,
      );
    }
    if (!["A", "B", "C", "D"].includes(block.correctAnswer)) {
      throw new Error(
        `Question ${block.questionNumber} has invalid correct answer ${block.correctAnswer}`,
      );
    }
  }
}

async function main() {
  const sourceText = readFileSync(
    "/Users/ashupathak/Documents/Sagar/QuizBattle/pdf_extract.txt",
    "utf8",
  );
  const blocks = getQuestionBlocks(sourceText);
  validateQuestions(blocks);

  await prisma.submission.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.question.deleteMany();
  await prisma.round.deleteMany();
  await prisma.club.deleteMany();
  await prisma.quizSession.deleteMany();

  await prisma.club.createMany({
    data: [
      { name: "STACK_PUSH", score: 0 },
      { name: "IT_INNOVATORS", score: 0 },
    ],
  });

  const roundRecords = [] as any[];
  for (let i = 0; i < roundDefinitions.length; i++) {
    const round = await prisma.round.create({
      data: {
        name: roundDefinitions[i].name,
        description: roundDefinitions[i].name,
        pointValue: roundDefinitions[i].pointValue,
        order: i + 1,
      },
    });
    roundRecords.push(round);
  }

  for (const block of blocks) {
    const roundIndex = Math.floor((block.questionNumber - 1) / 20);
    const round = roundRecords[roundIndex];
    if (!round)
      throw new Error(`Missing round for question ${block.questionNumber}`);

    await prisma.question.create({
      data: {
        roundId: round.id,
        questionNumber: block.questionNumber,
        questionText: block.questionText,
        optionA: block.optionA,
        optionB: block.optionB,
        optionC: block.optionC,
        optionD: block.optionD,
        correctAnswer: block.correctAnswer,
        points: roundDefinitions[roundIndex].pointValue,
        order: block.questionNumber,
      },
    });
  }

  await prisma.quizSession.create({
    data: {
      status: "WAITING",
      currentRoundId: null,
      currentQuestionId: null,
      questionStartedAt: null,
    },
  });

  console.log(`Rounds imported: ${roundDefinitions.length}`);
  console.log(`Questions imported: ${blocks.length}`);
}

main().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
