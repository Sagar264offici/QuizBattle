/**
 * TEST MODE QUESTION SET — QUIZBATTLE
 *
 * This dataset is used ONLY by the testing mode (/test, /admin/test).
 * It is deliberately isolated from the live 100-question college quiz:
 *   - question IDs use a separate namespace (2001-2020) so they can never
 *     collide with live question IDs (1-100)
 *   - scoring: R1 = 4, R2 = 4, R3 = 8, R4 = 8, R5 = 12  (TOTAL = 36)
 *
 * Do NOT add, remove, or reword these questions.
 */

export interface QuestionItem {
  id: number;
  questionNumber: number;
  roundId: number;
  roundName: string;
  points: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
}

export interface RoundItem {
  id: number;
  name: string;
  pointValue: number;
}

export const TEST_ROUNDS: RoundItem[] = [
  { id: 1, name: "Computer & IT Basics", pointValue: 1 },
  { id: 2, name: "Internet, Web & Digital World", pointValue: 1 },
  { id: 3, name: "Programming & Logic", pointValue: 2 },
  { id: 4, name: "Cybersecurity, AI & Modern IT", pointValue: 2 },
  { id: 5, name: "The Hackathon Challenge", pointValue: 3 },
];

export const TEST_QUESTIONS: QuestionItem[] = [
  // ── ROUND 1 — Computer & IT Basics (1 point each) ─────────────────────────
  {
    id: 2001,
    questionNumber: 1,
    roundId: 1,
    roundName: "Computer & IT Basics",
    points: 1,
    questionText: "Which component is primarily responsible for rendering graphics on a computer?",
    optionA: "PSU",
    optionB: "GPU",
    optionC: "RAM",
    optionD: "SSD",
    correctAnswer: "B",
  },
  {
    id: 2002,
    questionNumber: 2,
    roundId: 1,
    roundName: "Computer & IT Basics",
    points: 1,
    questionText: "Which unit is commonly used to measure CPU clock speed?",
    optionA: "Volt",
    optionB: "Pixel",
    optionC: "Gigahertz",
    optionD: "Byte",
    correctAnswer: "C",
  },
  {
    id: 2003,
    questionNumber: 3,
    roundId: 1,
    roundName: "Computer & IT Basics",
    points: 1,
    questionText: "What is the main purpose of a motherboard?",
    optionA: "To display images",
    optionB: "To connect and allow communication between computer components",
    optionC: "To store files permanently",
    optionD: "To provide internet service",
    correctAnswer: "B",
  },
  {
    id: 2004,
    questionNumber: 4,
    roundId: 1,
    roundName: "Computer & IT Basics",
    points: 1,
    questionText: "Which connector is commonly used to connect a modern monitor to a computer?",
    optionA: "HDMI",
    optionB: "RJ-11",
    optionC: "PS/2",
    optionD: "SATA",
    correctAnswer: "A",
  },

  // ── ROUND 2 — Internet, Web & Digital World (1 point each) ────────────────
  {
    id: 2005,
    questionNumber: 5,
    roundId: 2,
    roundName: "Internet, Web & Digital World",
    points: 1,
    questionText: "What does DNS primarily do?",
    optionA: "Converts domain names into IP addresses",
    optionB: "Compresses videos",
    optionC: "Encrypts hard drives",
    optionD: "Increases Wi-Fi speed",
    correctAnswer: "A",
  },
  {
    id: 2006,
    questionNumber: 6,
    roundId: 2,
    roundName: "Internet, Web & Digital World",
    points: 1,
    questionText: "Which IP address is from the private IPv4 range commonly used by home networks?",
    optionA: "8.8.8.8",
    optionB: "192.168.1.10",
    optionC: "1.1.1.1",
    optionD: "142.250.72.14",
    correctAnswer: "B",
  },
  {
    id: 2007,
    questionNumber: 7,
    roundId: 2,
    roundName: "Internet, Web & Digital World",
    points: 1,
    questionText: "What does the abbreviation VPN stand for?",
    optionA: "Virtual Private Network",
    optionB: "Verified Public Network",
    optionC: "Virtual Processing Node",
    optionD: "Visual Private Node",
    correctAnswer: "A",
  },
  {
    id: 2008,
    questionNumber: 8,
    roundId: 2,
    roundName: "Internet, Web & Digital World",
    points: 1,
    questionText: "Which HTTP status code indicates that a server has encountered an internal error?",
    optionA: "201",
    optionB: "301",
    optionC: "403",
    optionD: "500",
    correctAnswer: "D",
  },

  // ── ROUND 3 — Programming & Logic (2 points each) ─────────────────────────
  {
    id: 2009,
    questionNumber: 9,
    roundId: 3,
    roundName: "Programming & Logic",
    points: 2,
    questionText: "What is the value of 7 % 3 in most programming languages?",
    optionA: "1",
    optionB: "2",
    optionC: "3",
    optionD: "0",
    correctAnswer: "A",
  },
  {
    id: 2010,
    questionNumber: 10,
    roundId: 3,
    roundName: "Programming & Logic",
    points: 2,
    questionText: "Which data structure is generally used to implement function call management?",
    optionA: "Stack",
    optionB: "Queue",
    optionC: "Graph",
    optionD: "Hash table",
    correctAnswer: "A",
  },
  {
    id: 2011,
    questionNumber: 11,
    roundId: 3,
    roundName: "Programming & Logic",
    points: 2,
    questionText: "What is the time complexity of accessing an element by index in a typical array?",
    optionA: "O(n)",
    optionB: "O(log n)",
    optionC: "O(1)",
    optionD: "O(n²)",
    correctAnswer: "C",
  },
  {
    id: 2012,
    questionNumber: 12,
    roundId: 3,
    roundName: "Programming & Logic",
    points: 2,
    questionText: "What will this pseudocode print?\nx = 4\nx = x + 3\nprint(x * 2)",
    optionA: "7",
    optionB: "8",
    optionC: "14",
    optionD: "16",
    correctAnswer: "C",
  },

  // ── ROUND 4 — Cybersecurity, AI & Modern IT (2 points each) ───────────────
  {
    id: 2013,
    questionNumber: 13,
    roundId: 4,
    roundName: "Cybersecurity, AI & Modern IT",
    points: 2,
    questionText: "What is social engineering in cybersecurity?",
    optionA: "Designing social-media websites",
    optionB: "Manipulating people into revealing information or performing actions",
    optionC: "Building computer networks",
    optionD: "Programming social robots",
    correctAnswer: "B",
  },
  {
    id: 2014,
    questionNumber: 14,
    roundId: 4,
    roundName: "Cybersecurity, AI & Modern IT",
    points: 2,
    questionText: "What does a password manager primarily help users do?",
    optionA: "Increase internet speed",
    optionB: "Store and manage passwords securely",
    optionC: "Remove computer viruses automatically",
    optionD: "Upgrade computer hardware",
    correctAnswer: "B",
  },
  {
    id: 2015,
    questionNumber: 15,
    roundId: 4,
    roundName: "Cybersecurity, AI & Modern IT",
    points: 2,
    questionText: "What is a deepfake?",
    optionA: "A damaged hard drive",
    optionB: "AI-generated or manipulated media designed to appear authentic",
    optionC: "An encrypted database",
    optionD: "A type of firewall",
    correctAnswer: "B",
  },
  {
    id: 2016,
    questionNumber: 16,
    roundId: 4,
    roundName: "Cybersecurity, AI & Modern IT",
    points: 2,
    questionText: "Which technology is commonly used to generate a response from a large language model?",
    optionA: "Natural Language Processing",
    optionB: "Optical disk formatting",
    optionC: "BIOS flashing",
    optionD: "Packet switching only",
    correctAnswer: "A",
  },

  // ── ROUND 5 — The Hackathon Challenge (3 points each) ─────────────────────
  {
    id: 2017,
    questionNumber: 17,
    roundId: 5,
    roundName: "The Hackathon Challenge",
    points: 3,
    questionText: "A program has an array:\n[4, 8, 2, 9]\nIf the program swaps the first and last elements, what is the new array?",
    optionA: "[9, 8, 2, 4]",
    optionB: "[4, 2, 8, 9]",
    optionC: "[2, 8, 4, 9]",
    optionD: "[9, 2, 8, 4]",
    correctAnswer: "A",
  },
  {
    id: 2018,
    questionNumber: 18,
    roundId: 5,
    roundName: "The Hackathon Challenge",
    points: 3,
    questionText: "A website stores user accounts. Which approach is most appropriate for preventing a database query from being manipulated through user input?",
    optionA: "SQL parameterized queries",
    optionB: "Increasing monitor resolution",
    optionC: "Using a longer variable name",
    optionD: "Disabling the database",
    correctAnswer: "A",
  },
  {
    id: 2019,
    questionNumber: 19,
    roundId: 5,
    roundName: "The Hackathon Challenge",
    points: 3,
    questionText: "A sorting algorithm repeatedly divides a sorted search range into two halves to locate a value. Which algorithmic technique is being used?",
    optionA: "Linear search",
    optionB: "Binary search",
    optionC: "Bubble sort",
    optionD: "Depth-first search",
    correctAnswer: "B",
  },
  {
    id: 2020,
    questionNumber: 20,
    roundId: 5,
    roundName: "The Hackathon Challenge",
    points: 3,
    questionText: "Your application works perfectly on your computer but crashes immediately after deployment. What should you check FIRST?",
    optionA: "Change the application logo",
    optionB: "Check deployment/runtime logs and environment configuration",
    optionC: "Rewrite the entire application",
    optionD: "Delete the database",
    correctAnswer: "B",
  },
];
