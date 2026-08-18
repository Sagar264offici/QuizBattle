/**
 * QuizBattle API — Upstash Redis-backed Vercel Serverless Handler
 * Uses @upstash/redis SDK for shared state across all serverless lambdas.
 */

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData.js";
import { createMemoryStore } from "./memoryStore.js";
import {
  emitRealtime,
  realtimeClientCount,
  isRealtimeAttached,
} from "../server/src/realtime.js";
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

export const ROUNDS: RoundItem[] = [
  { "id": 1, "name": "ROUND 1 — EASY IT & GENERAL BASICS", "pointValue": 1 },
  { "id": 2, "name": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY", "pointValue": 1 },
  { "id": 3, "name": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS", "pointValue": 1 },
  { "id": 4, "name": "ROUND 4 — HARD LOGIC & REASONING", "pointValue": 3 },
  { "id": 5, "name": "ROUND 5 — HARD IT + LOGIC", "pointValue": 3 },
];

export const QUESTIONS: QuestionItem[] = [
  {
    "id": 1,
    "questionNumber": 1,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which part of a computer performs arithmetic calculations?",
    "optionA": "ALU",
    "optionB": "RAM",
    "optionC": "SSD",
    "optionD": "BIOS",
    "correctAnswer": "A"
  },
  {
    "id": 2,
    "questionNumber": 2,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which device is primarily used to produce a paper copy of a digital file?",
    "optionA": "Scanner",
    "optionB": "Printer",
    "optionC": "Webcam",
    "optionD": "Router",
    "correctAnswer": "B"
  },
  {
    "id": 3,
    "questionNumber": 3,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "What does Ctrl + A normally do?",
    "optionA": "Save all files",
    "optionB": "Select all",
    "optionC": "Close all",
    "optionD": "Align text",
    "correctAnswer": "B"
  },
  {
    "id": 4,
    "questionNumber": 4,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which storage device has no moving mechanical disk?",
    "optionA": "HDD",
    "optionB": "SSD",
    "optionC": "DVD",
    "optionD": "Floppy disk",
    "correctAnswer": "B"
  },
  {
    "id": 5,
    "questionNumber": 5,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which file extension is commonly associated with a spreadsheet?",
    "optionA": ".xlsx",
    "optionB": ".mp4",
    "optionC": ".psd",
    "optionD": ".wav",
    "correctAnswer": "A"
  },
  {
    "id": 6,
    "questionNumber": 6,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which key is commonly used to cancel an operation or close a menu?",
    "optionA": "Esc",
    "optionB": "Tab",
    "optionC": "Caps Lock",
    "optionD": "Home",
    "correctAnswer": "A"
  },
  {
    "id": 7,
    "questionNumber": 7,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "What does HDMI commonly carry?",
    "optionA": "Digital audio and video",
    "optionB": "Electricity only",
    "optionC": "Internet only",
    "optionD": "Keyboard commands only",
    "correctAnswer": "A"
  },
  {
    "id": 8,
    "questionNumber": 8,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which device is used to project a computer display onto a large screen?",
    "optionA": "Modem",
    "optionB": "Projector",
    "optionC": "Scanner",
    "optionD": "UPS",
    "correctAnswer": "B"
  },
  {
    "id": 9,
    "questionNumber": 9,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which of these is an example of system software?",
    "optionA": "Operating system",
    "optionB": "Calculator document",
    "optionC": "Photo",
    "optionD": "Music file",
    "correctAnswer": "A"
  },
  {
    "id": 10,
    "questionNumber": 10,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "What does a UPS primarily provide?",
    "optionA": "Backup power",
    "optionB": "Faster internet",
    "optionC": "More RAM",
    "optionD": "Wireless networking",
    "correctAnswer": "A"
  },
  {
    "id": 11,
    "questionNumber": 11,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which unit is commonly used to measure processor speed?",
    "optionA": "GHz",
    "optionB": "Liter",
    "optionC": "Volt",
    "optionD": "Pixel",
    "correctAnswer": "A"
  },
  {
    "id": 12,
    "questionNumber": 12,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "What does GUI stand for?",
    "optionA": "Graphical User Interface",
    "optionB": "General Utility Internet",
    "optionC": "Global User Integration",
    "optionD": "Graphic Utility Input",
    "correctAnswer": "A"
  },
  {
    "id": 13,
    "questionNumber": 13,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which application is mainly used to play audio/video files?",
    "optionA": "Media player",
    "optionB": "Compiler",
    "optionC": "Firewall",
    "optionD": "BIOS",
    "correctAnswer": "A"
  },
  {
    "id": 14,
    "questionNumber": 14,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which technology is commonly used to connect wireless headphones to a phone?",
    "optionA": "Bluetooth",
    "optionB": "VGA",
    "optionC": "Ethernet",
    "optionD": "SATA",
    "correctAnswer": "A"
  },
  {
    "id": 15,
    "questionNumber": 15,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which symbol is commonly associated with a decimal point?",
    "optionA": ".",
    "optionB": "/",
    "optionC": ":",
    "optionD": ";",
    "correctAnswer": "A"
  },
  {
    "id": 16,
    "questionNumber": 16,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "What is the main purpose of a recycle bin/trash?",
    "optionA": "Temporarily hold deleted files",
    "optionB": "Increase storage",
    "optionC": "Scan for viruses",
    "optionD": "Compress files",
    "correctAnswer": "A"
  },
  {
    "id": 17,
    "questionNumber": 17,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which of these is measured in pixels?",
    "optionA": "Screen resolution",
    "optionB": "CPU speed",
    "optionC": "Storage capacity",
    "optionD": "Internet bandwidth",
    "correctAnswer": "A"
  },
  {
    "id": 18,
    "questionNumber": 18,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which device converts a digital signal to an analog signal for certain communication systems?",
    "optionA": "Modem",
    "optionB": "Keyboard",
    "optionC": "Monitor",
    "optionD": "Mouse",
    "correctAnswer": "A"
  },
  {
    "id": 19,
    "questionNumber": 19,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which key is generally used to move between fields in a form?",
    "optionA": "Tab",
    "optionB": "Alt",
    "optionC": "Esc",
    "optionD": "Spacebar",
    "correctAnswer": "A"
  },
  {
    "id": 20,
    "questionNumber": 20,
    "roundId": 1,
    "roundName": "ROUND 1 — EASY IT & GENERAL BASICS",
    "points": 1,
    "questionText": "Which of these is a common video-conferencing application?",
    "optionA": "Microsoft Teams",
    "optionB": "Notepad",
    "optionC": "File Explorer",
    "optionD": "Paint",
    "correctAnswer": "A"
  },
  {
    "id": 21,
    "questionNumber": 21,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which protocol is used to securely log into a remote computer through a command line?",
    "optionA": "SSH",
    "optionB": "SMTP",
    "optionC": "POP3",
    "optionD": "ARP",
    "correctAnswer": "A"
  },
  {
    "id": 22,
    "questionNumber": 22,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which protocol is commonly used to transfer files between computers?",
    "optionA": "FTP",
    "optionB": "DNS",
    "optionC": "ICMP",
    "optionD": "DHCP",
    "correctAnswer": "A"
  },
  {
    "id": 23,
    "questionNumber": 23,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is the main purpose of a subnet mask?",
    "optionA": "Identify the network and host portions of an IP address",
    "optionB": "Encrypt passwords",
    "optionC": "Increase bandwidth",
    "optionD": "Store websites",
    "correctAnswer": "A"
  },
  {
    "id": 24,
    "questionNumber": 24,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which device forwards frames using MAC addresses?",
    "optionA": "Router",
    "optionB": "Switch",
    "optionC": "Modem",
    "optionD": "Repeater",
    "correctAnswer": "B"
  },
  {
    "id": 25,
    "questionNumber": 25,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is the main purpose of a compiler?",
    "optionA": "Translate source code into another form, often machine/executable code",
    "optionB": "Browse websites",
    "optionC": "Manage users",
    "optionD": "Store databases",
    "correctAnswer": "A"
  },
  {
    "id": 26,
    "questionNumber": 26,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which data structure stores elements as key-value pairs?",
    "optionA": "Dictionary/Map",
    "optionB": "Stack",
    "optionC": "Queue",
    "optionD": "Array only",
    "correctAnswer": "A"
  },
  {
    "id": 27,
    "questionNumber": 27,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What does an else block normally handle?",
    "optionA": "The alternative when an if condition is false",
    "optionB": "Repeating a loop",
    "optionC": "Defining a database",
    "optionD": "Starting the operating system",
    "correctAnswer": "A"
  },
  {
    "id": 28,
    "questionNumber": 28,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is the purpose of a return statement in a function?",
    "optionA": "Send a value back to the caller",
    "optionB": "Restart the computer",
    "optionC": "Delete the function",
    "optionD": "Create a variable automatically",
    "correctAnswer": "A"
  },
  {
    "id": 29,
    "questionNumber": 29,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "In programming, what is an index commonly used for?",
    "optionA": "Accessing an element in a sequence",
    "optionB": "Encrypting data",
    "optionC": "Starting a server",
    "optionD": "Formatting a disk",
    "correctAnswer": "A"
  },
  {
    "id": 30,
    "questionNumber": 30,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which SQL clause filters rows based on a condition?",
    "optionA": "WHERE",
    "optionB": "ORDER",
    "optionC": "GROUP",
    "optionD": "INTO",
    "correctAnswer": "A"
  },
  {
    "id": 31,
    "questionNumber": 31,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which SQL clause sorts query results?",
    "optionA": "ORDER BY",
    "optionB": "SORT USING",
    "optionC": "ARRANGE",
    "optionD": "SEQUENCE",
    "correctAnswer": "A"
  },
  {
    "id": 32,
    "questionNumber": 32,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What does COUNT() generally do in SQL?",
    "optionA": "Counts rows/values",
    "optionB": "Deletes rows",
    "optionC": "Renames a table",
    "optionD": "Encrypts records",
    "correctAnswer": "A"
  },
  {
    "id": 33,
    "questionNumber": 33,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is a foreign key mainly used for?",
    "optionA": "Linking related tables",
    "optionB": "Encrypting a database",
    "optionC": "Starting a server",
    "optionD": "Creating a password",
    "correctAnswer": "A"
  },
  {
    "id": 34,
    "questionNumber": 34,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is an IP address beginning with 127.0.0.1 commonly associated with?",
    "optionA": "Loopback/local machine",
    "optionB": "Broadcast network",
    "optionC": "Public DNS",
    "optionD": "Cloud server",
    "correctAnswer": "A"
  },
  {
    "id": 35,
    "questionNumber": 35,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which HTTP status code generally represents \"Internal Server Error\"?",
    "optionA": "201",
    "optionB": "302",
    "optionC": "404",
    "optionD": "500",
    "correctAnswer": "D"
  },
  {
    "id": 36,
    "questionNumber": 36,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which HTTP status code usually indicates a resource was successfully created?",
    "optionA": "201",
    "optionB": "301",
    "optionC": "401",
    "optionD": "503",
    "correctAnswer": "A"
  },
  {
    "id": 37,
    "questionNumber": 37,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What does JSON primarily represent?",
    "optionA": "Structured data",
    "optionB": "Image pixels only",
    "optionC": "Audio signals",
    "optionD": "Operating-system kernels",
    "correctAnswer": "A"
  },
  {
    "id": 38,
    "questionNumber": 38,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which Git command creates a new local repository in the current folder?",
    "optionA": "git init",
    "optionB": "git start",
    "optionC": "git make",
    "optionD": "git repo",
    "correctAnswer": "A"
  },
  {
    "id": 39,
    "questionNumber": 39,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "Which Git command records staged changes?",
    "optionA": "git save",
    "optionB": "git commit",
    "optionC": "git record",
    "optionD": "git store",
    "correctAnswer": "B"
  },
  {
    "id": 40,
    "questionNumber": 40,
    "roundId": 2,
    "roundName": "ROUND 2 — MID-LEVEL IT & TECHNOLOGY",
    "points": 1,
    "questionText": "What is an API endpoint?",
    "optionA": "A specific location through which an API can be accessed",
    "optionB": "A computer's physical power button",
    "optionC": "A database password",
    "optionD": "A programming variable",
    "correctAnswer": "A"
  },
  {
    "id": 41,
    "questionNumber": 41,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which is the largest island in the world?",
    "optionA": "Greenland",
    "optionB": "Madagascar",
    "optionC": "Borneo",
    "optionD": "New Guinea",
    "correctAnswer": "A"
  },
  {
    "id": 42,
    "questionNumber": 42,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which country has the world's largest population of Muslims?",
    "optionA": "Saudi Arabia",
    "optionB": "Indonesia",
    "optionC": "Iran",
    "optionD": "Egypt",
    "correctAnswer": "B"
  },
  {
    "id": 43,
    "questionNumber": 43,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which country is famous for the ancient city of Machu Picchu?",
    "optionA": "Peru",
    "optionB": "Chile",
    "optionC": "Brazil",
    "optionD": "Bolivia",
    "correctAnswer": "A"
  },
  {
    "id": 44,
    "questionNumber": 44,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which is the deepest ocean trench known on Earth?",
    "optionA": "Mariana Trench",
    "optionB": "Tonga Trench",
    "optionC": "Java Trench",
    "optionD": "Puerto Rico Trench",
    "correctAnswer": "A"
  },
  {
    "id": 45,
    "questionNumber": 45,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which country is home to the Great Barrier Reef?",
    "optionA": "Australia",
    "optionB": "New Zealand",
    "optionC": "Indonesia",
    "optionD": "South Africa",
    "correctAnswer": "A"
  },
  {
    "id": 46,
    "questionNumber": 46,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which planet has the shortest year around the Sun?",
    "optionA": "Mercury",
    "optionB": "Venus",
    "optionC": "Mars",
    "optionD": "Earth",
    "correctAnswer": "A"
  },
  {
    "id": 47,
    "questionNumber": 47,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which gas makes up the largest portion of Earth's atmosphere?",
    "optionA": "Oxygen",
    "optionB": "Nitrogen",
    "optionC": "Carbon dioxide",
    "optionD": "Hydrogen",
    "correctAnswer": "B"
  },
  {
    "id": 48,
    "questionNumber": 48,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "What is the chemical symbol for gold?",
    "optionA": "Gd",
    "optionB": "Go",
    "optionC": "Au",
    "optionD": "Ag",
    "correctAnswer": "C"
  },
  {
    "id": 49,
    "questionNumber": 49,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which instrument measures atmospheric pressure?",
    "optionA": "Barometer",
    "optionB": "Thermometer",
    "optionC": "Hygrometer",
    "optionD": "Anemometer",
    "correctAnswer": "A"
  },
  {
    "id": 50,
    "questionNumber": 50,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which blood group is known as the universal donor for red blood cells?",
    "optionA": "AB+",
    "optionB": "O−",
    "optionC": "A+",
    "optionD": "B−",
    "correctAnswer": "B"
  },
  {
    "id": 51,
    "questionNumber": 51,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which is the largest organ of the human body?",
    "optionA": "Liver",
    "optionB": "Brain",
    "optionC": "Skin",
    "optionD": "Lung",
    "correctAnswer": "C"
  },
  {
    "id": 52,
    "questionNumber": 52,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which country uses the currency called the Baht?",
    "optionA": "Thailand",
    "optionB": "Vietnam",
    "optionC": "Cambodia",
    "optionD": "Laos",
    "correctAnswer": "A"
  },
  {
    "id": 53,
    "questionNumber": 53,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "What is the capital of Brazil?",
    "optionA": "Rio de Janeiro",
    "optionB": "São Paulo",
    "optionC": "Brasília",
    "optionD": "Salvador",
    "correctAnswer": "C"
  },
  {
    "id": 54,
    "questionNumber": 54,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which sea separates Europe and Africa?",
    "optionA": "Red Sea",
    "optionB": "Mediterranean Sea",
    "optionC": "Arabian Sea",
    "optionD": "Baltic Sea",
    "correctAnswer": "B"
  },
  {
    "id": 55,
    "questionNumber": 55,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which organization has its headquarters in New York City and works on international cooperation?",
    "optionA": "NATO",
    "optionB": "United Nations",
    "optionC": "FIFA",
    "optionD": "OPEC",
    "correctAnswer": "B"
  },
  {
    "id": 56,
    "questionNumber": 56,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "What is the lower house of India's Parliament?",
    "optionA": "Rajya Sabha",
    "optionB": "Lok Sabha",
    "optionC": "Vidhan Parishad",
    "optionD": "Gram Sabha",
    "correctAnswer": "B"
  },
  {
    "id": 57,
    "questionNumber": 57,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Who is the constitutional head of a state government in India?",
    "optionA": "Chief Minister",
    "optionB": "Governor",
    "optionC": "Chief Secretary",
    "optionD": "Speaker",
    "correctAnswer": "B"
  },
  {
    "id": 58,
    "questionNumber": 58,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "Which branch of government generally makes laws?",
    "optionA": "Legislature",
    "optionB": "Judiciary",
    "optionC": "Executive",
    "optionD": "Election Commission",
    "correctAnswer": "A"
  },
  {
    "id": 59,
    "questionNumber": 59,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "What is the right to vote generally called?",
    "optionA": "Franchise",
    "optionB": "Mandate",
    "optionC": "Census",
    "optionD": "Referendum",
    "correctAnswer": "A"
  },
  {
    "id": 60,
    "questionNumber": 60,
    "roundId": 3,
    "roundName": "ROUND 3 — WORLD, SCIENCE, TECHNOLOGY & CIVICS",
    "points": 1,
    "questionText": "What does GDP stand for?",
    "optionA": "Gross Domestic Product",
    "optionB": "General Development Plan",
    "optionC": "Global Domestic Production",
    "optionD": "Gross Development Percentage",
    "correctAnswer": "A"
  },
  {
    "id": 61,
    "questionNumber": 61,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the next number:\n\n7, 14, 28, 56, ?",
    "optionA": "84",
    "optionB": "96",
    "optionC": "112",
    "optionD": "120",
    "correctAnswer": "C"
  },
  {
    "id": 62,
    "questionNumber": 62,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the missing number:\n\n11, 22, 44, 88, ?",
    "optionA": "132",
    "optionB": "154",
    "optionC": "176",
    "optionD": "188",
    "correctAnswer": "C"
  },
  {
    "id": 63,
    "questionNumber": 63,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Which number does not belong?\n\n8, 27, 64, 81, 125",
    "optionA": "8",
    "optionB": "27",
    "optionC": "64",
    "optionD": "81",
    "correctAnswer": "D"
  },
  {
    "id": 64,
    "questionNumber": 64,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A number is multiplied by 4 and then 6 is added. The result is 30. What was the number?",
    "optionA": "4",
    "optionB": "5",
    "optionC": "6",
    "optionD": "8",
    "correctAnswer": "C"
  },
  {
    "id": 65,
    "questionNumber": 65,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the next pair:\n\nAB, DE, GH, JK, ?",
    "optionA": "LM",
    "optionB": "MN",
    "optionC": "OP",
    "optionD": "NO",
    "correctAnswer": "B"
  },
  {
    "id": 66,
    "questionNumber": 66,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "If every vowel in the word COMPUTER is replaced by #, what is produced?",
    "optionA": "C#MP#T#R",
    "optionB": "C#MPUT#R",
    "optionC": "C##PUTER",
    "optionD": "C#M#P#TER",
    "correctAnswer": "A"
  },
  {
    "id": 67,
    "questionNumber": 67,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Six students sit in a row. Ravi is to the left of Neha. Neha is to the left of Aman. Who must be ahead of Aman?",
    "optionA": "Ravi",
    "optionB": "Neha",
    "optionC": "Both Ravi and Neha",
    "optionD": "Cannot determine",
    "correctAnswer": "C"
  },
  {
    "id": 68,
    "questionNumber": 68,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A number is 25% of 240. What is the number?",
    "optionA": "40",
    "optionB": "50",
    "optionC": "60",
    "optionD": "80",
    "correctAnswer": "C"
  },
  {
    "id": 69,
    "questionNumber": 69,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "If 4 workers complete a job in 15 days at the same rate, how many days would 5 workers theoretically need?",
    "optionA": "10",
    "optionB": "12",
    "optionC": "15",
    "optionD": "18",
    "correctAnswer": "B"
  },
  {
    "id": 70,
    "questionNumber": 70,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the missing number:\n\n5 × 5 = 30\n6 × 6 = 42\n7 × 7 = 56\n8 × 8 = ?",
    "optionA": "64",
    "optionB": "72",
    "optionC": "80",
    "optionD": "88",
    "correctAnswer": "B"
  },
  {
    "id": 71,
    "questionNumber": 71,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A person is facing east. He turns right, then right again. Which direction is he facing?",
    "optionA": "North",
    "optionB": "South",
    "optionC": "East",
    "optionD": "West",
    "correctAnswer": "D"
  },
  {
    "id": 72,
    "questionNumber": 72,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "In a race, Maya finishes before Priya but after Riya. Who finishes first among these three?",
    "optionA": "Maya",
    "optionB": "Priya",
    "optionC": "Riya",
    "optionD": "Cannot determine",
    "correctAnswer": "C"
  },
  {
    "id": 73,
    "questionNumber": 73,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the next number:\n\n1, 4, 10, 22, 46, ?",
    "optionA": "82",
    "optionB": "90",
    "optionC": "94",
    "optionD": "96",
    "correctAnswer": "C"
  },
  {
    "id": 74,
    "questionNumber": 74,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A box has 5 red, 5 blue and 5 black pens. What is the minimum number you must pick to guarantee two pens of the same colour?",
    "optionA": "2",
    "optionB": "3",
    "optionC": "4",
    "optionD": "5",
    "correctAnswer": "C"
  },
  {
    "id": 75,
    "questionNumber": 75,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "If MONDAY is coded as 123456, what is the code for DAY?",
    "optionA": "456",
    "optionB": "345",
    "optionC": "126",
    "optionD": "356",
    "correctAnswer": "A"
  },
  {
    "id": 76,
    "questionNumber": 76,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A shopkeeper gives 10% discount on ₹900. What is the selling price?",
    "optionA": "₹810",
    "optionB": "₹820",
    "optionC": "₹850",
    "optionD": "₹890",
    "correctAnswer": "A"
  },
  {
    "id": 77,
    "questionNumber": 77,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "Find the odd one out:",
    "optionA": "121",
    "optionB": "144",
    "optionC": "169",
    "optionD": "195",
    "correctAnswer": "D"
  },
  {
    "id": 78,
    "questionNumber": 78,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A meeting starts at 2:40 PM and lasts 1 hour 35 minutes. When does it end?",
    "optionA": "3:55 PM",
    "optionB": "4:05 PM",
    "optionC": "4:15 PM",
    "optionD": "4:25 PM",
    "correctAnswer": "C"
  },
  {
    "id": 79,
    "questionNumber": 79,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "If P > Q, Q > R, and R > S, which is definitely true?",
    "optionA": "S > P",
    "optionB": "P > S",
    "optionC": "Q > P",
    "optionD": "S > Q",
    "correctAnswer": "B"
  },
  {
    "id": 80,
    "questionNumber": 80,
    "roundId": 4,
    "roundName": "ROUND 4 — HARD LOGIC & REASONING",
    "points": 3,
    "questionText": "A farmer has chickens and cows. There are 10 animals and 28 legs altogether. How many cows are there?",
    "optionA": "3",
    "optionB": "4",
    "optionC": "5",
    "optionD": "6",
    "correctAnswer": "B"
  },
  {
    "id": 81,
    "questionNumber": 81,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "What is the output?\n\nx = 8\nx += 3\nx //= 2",
    "optionA": "5",
    "optionB": "5.5",
    "optionC": "11",
    "optionD": "22",
    "correctAnswer": "A"
  },
  {
    "id": 82,
    "questionNumber": 82,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "How many times does the following loop print?\n\nfor i in range(2, 8):\n    print(i)",
    "optionA": "5",
    "optionB": "6",
    "optionC": "7",
    "optionD": "8",
    "correctAnswer": "B"
  },
  {
    "id": 83,
    "questionNumber": 83,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "What is the output?\n\na = 7\nb = 3\nprint(a % b)",
    "optionA": "1",
    "optionB": "2",
    "optionC": "3",
    "optionD": "4",
    "correctAnswer": "A"
  },
  {
    "id": 84,
    "questionNumber": 84,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A binary number 1010 represents which decimal number?",
    "optionA": "8",
    "optionB": "9",
    "optionC": "10",
    "optionD": "12",
    "correctAnswer": "C"
  },
  {
    "id": 85,
    "questionNumber": 85,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "What is the next value?\n\n1, 2, 4, 8, 16, 32, ?",
    "optionA": "48",
    "optionB": "56",
    "optionC": "64",
    "optionD": "72",
    "correctAnswer": "C"
  },
  {
    "id": 86,
    "questionNumber": 86,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "An array contains 12 elements. If indexing starts from 0, what is the index of the final element?",
    "optionA": "10",
    "optionB": "11",
    "optionC": "12",
    "optionD": "13",
    "correctAnswer": "B"
  },
  {
    "id": 87,
    "questionNumber": 87,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A program takes 2 seconds to process 100 records. At the same rate, how long for 500 records?",
    "optionA": "5 seconds",
    "optionB": "8 seconds",
    "optionC": "10 seconds",
    "optionD": "12 seconds",
    "correctAnswer": "C"
  },
  {
    "id": 88,
    "questionNumber": 88,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "Which operation has the highest priority in this expression?\n\n10 + 4 * 2",
    "optionA": "Addition",
    "optionB": "Multiplication",
    "optionC": "Assignment",
    "optionD": "Comparison",
    "correctAnswer": "B"
  },
  {
    "id": 89,
    "questionNumber": 89,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A web server receives 300 requests in 5 seconds. What is the average rate?",
    "optionA": "30 requests/sec",
    "optionB": "50 requests/sec",
    "optionC": "60 requests/sec",
    "optionD": "75 requests/sec",
    "correctAnswer": "C"
  },
  {
    "id": 90,
    "questionNumber": 90,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A table has 200 rows. A query selects only rows where age > 18, leaving 150 rows. How many rows were excluded?",
    "optionA": "25",
    "optionB": "40",
    "optionC": "50",
    "optionD": "75",
    "correctAnswer": "C"
  },
  {
    "id": 91,
    "questionNumber": 91,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "Which data structure is most suitable for checking whether an item exists quickly using a key?",
    "optionA": "Hash table",
    "optionB": "Stack",
    "optionC": "Queue",
    "optionD": "Linked list only",
    "correctAnswer": "A"
  },
  {
    "id": 92,
    "questionNumber": 92,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A process needs 500 MB of memory. The system has only 300 MB available. What is most likely to happen?",
    "optionA": "It may fail or use virtual memory depending on the system",
    "optionB": "The CPU doubles its speed",
    "optionC": "The keyboard stops working",
    "optionD": "The monitor becomes brighter",
    "correctAnswer": "A"
  },
  {
    "id": 93,
    "questionNumber": 93,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "If an algorithm doubles the input size and the number of operations also doubles, which complexity is most consistent?",
    "optionA": "O(1)",
    "optionB": "O(log n)",
    "optionC": "O(n)",
    "optionD": "O(n²)",
    "correctAnswer": "C"
  },
  {
    "id": 94,
    "questionNumber": 94,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A website loads quickly for 9 users but becomes very slow when 10,000 users access it simultaneously. What is the most likely issue?",
    "optionA": "Scalability",
    "optionB": "Keyboard failure",
    "optionC": "Screen resolution",
    "optionD": "File extension",
    "correctAnswer": "A"
  },
  {
    "id": 95,
    "questionNumber": 95,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A programmer wants to prevent users from entering negative ages into a form. What should be added?",
    "optionA": "Input validation",
    "optionB": "Image compression",
    "optionC": "DNS",
    "optionD": "Encryption only",
    "correctAnswer": "A"
  },
  {
    "id": 96,
    "questionNumber": 96,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A system accepts admin' OR '1'='1 as part of a database login query. What kind of security problem might this indicate?",
    "optionA": "SQL injection",
    "optionB": "DDoS",
    "optionC": "Bluetooth attack",
    "optionD": "File compression",
    "correctAnswer": "A"
  },
  {
    "id": 97,
    "questionNumber": 97,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A program has a loop inside another loop. If the outer loop runs 5 times and the inner loop runs 4 times for each outer iteration, how many total inner executions occur?",
    "optionA": "9",
    "optionB": "16",
    "optionC": "20",
    "optionD": "25",
    "correctAnswer": "C"
  },
  {
    "id": 98,
    "questionNumber": 98,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A server has 4 GB RAM. Three applications use 900 MB, 700 MB and 600 MB. Approximately how much RAM remains?",
    "optionA": "1.0 GB",
    "optionB": "1.5 GB",
    "optionC": "1.8 GB",
    "optionD": "2.2 GB",
    "correctAnswer": "C"
  },
  {
    "id": 99,
    "questionNumber": 99,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "A search algorithm eliminates half of the remaining possibilities at every step. Which algorithmic idea does this describe?",
    "optionA": "Linear search",
    "optionB": "Binary search",
    "optionC": "Bubble sort",
    "optionD": "Hash collision",
    "correctAnswer": "B"
  },
  {
    "id": 100,
    "questionNumber": 100,
    "roundId": 5,
    "roundName": "ROUND 5 — HARD IT + LOGIC",
    "points": 3,
    "questionText": "Your hackathon application suddenly gets 10× more traffic. Which change is most directly aimed at handling the increased load?",
    "optionA": "Increase scalability/resources",
    "optionB": "Change the logo",
    "optionC": "Rename variables",
    "optionD": "Change the font",
    "correctAnswer": "A"
  },
];


// ── Pure Logic Helpers ────────────────────────────────────────────────────────

function isValidClub(club: string): boolean {
  return club === "STACK_PUSH" || club === "IT_INNOVATORS";
}

function evaluateSubmission(answer: string, correctAnswer: string, points: number) {
  const isCorrect = answer === correctAnswer;
  return {
    isCorrect,
    pointsAwarded: isCorrect ? points : 0,
  };
}

// ── Redis Native REST Client ───────────────────────────────────────────────

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "https://valued-bluebird-145233.upstash.io")
  .replace(/^["']|["']$/g, "")
  .trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAAjdRAAIgcDIwYTE1NmM1Y2I2NzM0MDQ3YjFiZGQ0ZmM3NWZiMWQ0YQ")
  .replace(/^["']|["']$/g, "")
  .trim();

// ── Local in-memory store (zero-cost event mode) ─────────────────────────────
// Enabled explicitly via QUIZ_STORE=memory, or automatically when no Upstash
// credentials are configured outside Vercel. Every Redis command then runs
// against an in-process store: no quota, no network, no cost — the exact same
// command semantics, just local. This powers running the whole quiz from one
// host machine (LAN, or a free public tunnel like Cloudflare Quick Tunnel /
// ngrok) so remote students can join without any paid database.
const USE_MEMORY_STORE =
  process.env.QUIZ_STORE === "memory" ||
  (process.env.VERCEL !== "1" && !process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_TOKEN);
const memoryStore = USE_MEMORY_STORE ? createMemoryStore() : null;

// Sentinel returned by redisCommand when the Redis store is unreachable.
// It is deliberately distinct from `null` (which Redis itself returns for a
// missing key), so callers can fail closed instead of mistaking an outage
// for an empty store. `undefined` can never be a real Redis result (JSON has
// no undefined).
const REDIS_UNAVAILABLE = undefined;

/**
 * True when an Upstash response body says the free-tier REQUEST QUOTA is
 * exhausted ("ERR max requests limit exceeded" / "ERR max daily request
 * limit exceeded"). That is a billing condition — the store itself is fine —
 * so it must surface as its own error instead of being mistaken for an outage.
 */
function isUpstashQuotaErrorBody(text: string): boolean {
  return /max (requests?|daily request) limit exceeded/i.test(text);
}

async function redisCommand(cmd: (string | number)[]) {
  countRedisCommand(cmd);
  // In-memory mode: dispatch to the local store — never touches Upstash.
  if (memoryStore) return memoryStore.command(cmd);
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) {
      // Upstash answers HTTP 400 with an error body when the monthly/daily
      // request quota is exhausted — throw so the host sees the real fix
      // (upgrade plan / new database) instead of a generic "unreachable".
      const text = await res.text().catch(() => "");
      if (isUpstashQuotaErrorBody(text)) throw new RedisQuotaExceededError();
      return REDIS_UNAVAILABLE;
    }
    const data = (await res.json()) as { result?: any; error?: string };
    if (data && typeof data === "object" && "error" in data) {
      if (typeof data.error === "string" && isUpstashQuotaErrorBody(data.error)) {
        throw new RedisQuotaExceededError();
      }
      return REDIS_UNAVAILABLE;
    }
    return data.result;
  } catch (err) {
    if (err instanceof RedisQuotaExceededError) throw err;
    console.error("Redis error:", err);
    return REDIS_UNAVAILABLE;
  }
}

/**
 * Batch several INDEPENDENT Redis commands into ONE HTTP request using the
 * Upstash /pipeline endpoint. Returns an array of results in command order
 * (a failed command yields REDIS_UNAVAILABLE for its slot); returns
 * REDIS_UNAVAILABLE itself only when the whole request failed. This is the
 * key scalability fix: the student session poll used to make 5+ sequential
 * Redis round-trips per request — with hundreds of students polling, that
 * multiplied into enormous load and slow responses.
 */
async function redisPipeline(cmds: (string | number)[][]) {
  if (cmds.length === 0) return [];
  for (const c of cmds) countRedisCommand(c);
  // In-memory mode: apply the batch against the local store.
  if (memoryStore) return memoryStore.pipeline(cmds);
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isUpstashQuotaErrorBody(text)) throw new RedisQuotaExceededError();
      return REDIS_UNAVAILABLE;
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return REDIS_UNAVAILABLE;
    return data.map((item: any) => {
      if (item && typeof item === "object" && "result" in item) return item.result;
      // Per-command failure slot: when the quota is exhausted, EVERY command
      // in the pipeline fails with the quota error — surface it as such.
      if (
        item &&
        typeof item === "object" &&
        typeof item.error === "string" &&
        isUpstashQuotaErrorBody(item.error)
      ) {
        throw new RedisQuotaExceededError();
      }
      return REDIS_UNAVAILABLE;
    });
  } catch (err) {
    if (err instanceof RedisQuotaExceededError) throw err;
    console.error("Redis pipeline error:", err);
    return REDIS_UNAVAILABLE;
  }
}

// ── In-process Redis command counters (diagnostics) ────────────────────────
// Incremented on every command issued through redisCommand/redisPipeline.
// On a persistent server these give a live measure of Redis load; on Vercel
// they are per-lambda snapshots (still useful as a rough gauge).
const REDIS_READ_COMMANDS = new Set(["GET", "HGET", "HGETALL", "SMEMBERS", "SISMEMBER", "SCARD", "PING"]);
const REDIS_WRITE_COMMANDS = new Set(["SET", "HSET", "HDEL", "SADD", "SREM", "INCR", "INCRBY", "DEL", "EXPIRE", "FLUSHDB", "EVAL"]);
const redisCounters = {
  commands: 0,
  reads: 0,
  writes: 0,
  since: Date.now(),
};

function countRedisCommand(cmd: (string | number)[]) {
  const name = String(cmd[0]).toUpperCase();
  redisCounters.commands += 1;
  if (REDIS_READ_COMMANDS.has(name)) redisCounters.reads += 1;
  else if (REDIS_WRITE_COMMANDS.has(name)) redisCounters.writes += 1;
}

const redis = {
  get: <T = string>(key: string): Promise<T | null> => redisCommand(["GET", key]),
  set: (key: string, val: string, opts?: { ex?: number }) => {
    if (opts?.ex) {
      return redisCommand(["SET", key, val, "EX", opts.ex]);
    }
    return redisCommand(["SET", key, val]);
  },
  incr: (key: string): Promise<number> => redisCommand(["INCR", key]),
  incrby: (key: string, by: number): Promise<number> => redisCommand(["INCRBY", key, by]),
  flushdb: () => redisCommand(["FLUSHDB"]),
  ping: () => redisCommand(["PING"]),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Quiz lifecycle state machine (server-authoritative):
 *
 *   PREPARING            — host preparation. No question is exposed to
 *                          students. Only the host's START action can leave it.
 *        ↓  (host START QUIZ → start-countdown)
 *   COUNTDOWN (5s)       — question hidden from students; projector overlay
 *        ↓  (server auto-transitions on the authoritative countdownEndsAt)
 *   LIVE (15/30/45s)     — question visible, submissions accepted (duration
 *                          scales with question difficulty: Q1–40 = 15s,
 *                          Q41–80 = 30s, Q81–100 = 45s)
 *        ↓  (server auto-transitions on questionEndsAt, or host LOCK)
 *   LOCKED               — answers locked, no more submissions
 *        ↓  (host REVEAL)
 *   REVEALED             — correct answer shown
 *        ↓  (host NEXT / PREV / SELECT → back to WAITING for the next question)
 *   WAITING              — between-questions state (question still hidden)
 *        ↓  (host START QUESTION → COUNTDOWN)
 *   COUNTDOWN → LIVE → …
 *
 * FINISHED (= COMPLETED) is the terminal state reached via host END QUIZ.
 *
 * Every transition is validated server-side; invalid transitions are rejected
 * with 400 so students/clients can never drive the quiz out of order.
 */
type QuizStatus = "PREPARING" | "WAITING" | "COUNTDOWN" | "LIVE" | "LOCKED" | "REVEALED" | "FINISHED";

const COUNTDOWN_SECONDS = 5;

/**
 * There is deliberately NO hard participant ceiling. Live and test portals
 * admit as many students as the infrastructure (Redis, function concurrency,
 * bandwidth) can serve. Registration is concurrency-safe (atomic SADD name
 * dedup) and capacity is an infrastructure concern, not an app constant.
 */

/**
 * Fastest-finger speed bonus (server-authoritative, per question).
 *
 * Among all valid CORRECT answers to the same question, ranked by the server
 * (responseTimeMs ASC, submission timestamp ASC, participant id ASC):
 *   1st correct  → +3 speed bonus
 *   2nd correct  → +2 speed bonus
 *   3rd correct  → +1 speed bonus
 *   4th and later → +0 speed bonus
 * Wrong answers never receive a speed bonus.
 *
 * earnedPoints = basePoints (question.points) + speedBonus
 */

/**
 * True when a SUBMIT_LUA result is neither the "DUPLICATE" sentinel (checked
 * by the caller first) nor a valid ranked JSON payload. The store accepted the
 * submission but returned something unexpected — the caller fails closed so a
 * malformed response can never lead to double-scoring or a lost score.
 */
function rankedStatusInvalid(status: unknown): boolean {
  if (typeof status === "string" && status.startsWith("{")) {
    try {
      return JSON.parse(status)?.status !== "OK";
    } catch (_) {
      return true;
    }
  }
  return true;
}

/**
 * Per-question answer window (server-authoritative), scaled by difficulty and
 * quiz mode:
 *
 * LIVE quiz (100 questions):
 *   Q1–40    → 15s (easy warm-up rounds)
 *   Q41–80   → 30s (core rounds)
 *   Q81–100  → 45s (hackathon challenge finale)
 *
 * TEST quiz (50 questions, 3 rounds):
 *   Q1–20    → 15s (ROUND 1 — Easy IT & Technology, 1 pt)
 *   Q21–50   → 45s (ROUNDS 2–3 — C/C++ Output + Java Patterns, 2–3 pts)
 *
 * Unknown/future question numbers fall back to the default 30s.
 */
function questionDurationSeconds(questionNumber: number | null | undefined, mode: QuizMode = "live"): number {
  const n = Number(questionNumber) || 0;
  if (mode === "test") {
    // Easy IT trivia (Q1-20): 15s; coding/output/pattern rounds (Q21-50): 45s
    if (n >= 1 && n <= 20) return 15;
    if (n >= 21 && n <= 50) return 45;
    return 30;
  }
  if (n >= 1 && n <= 40) return 15;
  if (n >= 81) return 45;
  if (n >= 41 && n <= 80) return 30;
  return 30;
}

const QUESTION_SECONDS = questionDurationSeconds(1, "live");

interface QuizSessionState {
  status: QuizStatus;
  currentQuestionId: number | null;
  questionStartedAt: string | null;
  countdownEndsAt: string | null;
  questionEndsAt: string | null;
  durationSeconds: number;
  correctAnswer: string | null;
  /**
   * Student portal gate. While false, new students CANNOT register/join —
   * they are told to wait until the host opens the portal. Students who are
   * already registered keep playing; this only gates joining.
   */
  portalOpen: boolean;
  updatedAt: string;
}

const DEFAULT_STATE: QuizSessionState = {
  status: "PREPARING",
  currentQuestionId: null,
  questionStartedAt: null,
  countdownEndsAt: null,
  questionEndsAt: null,
  durationSeconds: QUESTION_SECONDS,
  correctAnswer: null,
  portalOpen: false,
  updatedAt: new Date().toISOString(),
};

/**
 * Allowed admin-driven transitions. AUTO transitions (COUNTDOWN→LIVE→LOCKED)
 * are handled separately in getState() using server timestamps.
 */
function canTransition(from: QuizStatus, to: QuizStatus): boolean {
  switch (to) {
    case "COUNTDOWN":
      // Host may start a countdown from preparation, between-questions, or
      // after reveal/restart — but never while a question is running.
      return from === "PREPARING" || from === "WAITING" || from === "REVEALED" || from === "FINISHED";
    case "LIVE":
      // Direct start-question (skips countdown) used by host quick-start.
      return from === "PREPARING" || from === "WAITING" || from === "REVEALED";
    case "LOCKED":
      return from === "LIVE";
    case "REVEALED":
      return from === "LOCKED" || from === "LIVE";
    case "WAITING":
      // Navigating between questions is always allowed.
      return true;
    case "FINISHED":
    case "PREPARING":
      // Terminal/reset states are reachable from anywhere via explicit host actions.
      return true;
    default:
      return false;
  }
}

// ── Quiz Modes ────────────────────────────────────────────────────────────────

export type QuizMode = "live" | "test";

function quizKeys(mode: QuizMode) {
  const isTest = mode === "test";
  return {
    state: isTest ? "quiz:test:state" : "quiz:state",
    participantsMap: isTest ? "quiz:test:participantsMap" : "quiz:participantsMap",
    participantTokens: isTest ? "quiz:test:participantTokens" : "quiz:participantTokens",
    nextId: isTest ? "quiz:test:nextParticipantId" : "quiz:nextParticipantId",
    sessionGen: isTest ? "quiz:test:sessionGen" : "quiz:sessionGen",
    kickedTokens: isTest ? "quiz:test:kickedTokens" : "quiz:kickedTokens",
    // Anti-cheat: set of normalized "name|club" strings for students currently
    // in the roster. O(1) SISMEMBER/SADD on register — never scans the roster.
    nameIndex: isTest ? "quiz:test:nameIndex" : "quiz:nameIndex",
    nameKey: (name: string, club: string) => `${String(name || "").trim().toLowerCase().replace(/\s+/g, " ")}|${String(club || "").toUpperCase()}`,
    participantKey: (token: string) => (isTest ? `pt:${token}` : `p:${token}`),
    submission: (pid: number, qid: number) => (isTest ? `sub:test:${pid}:${qid}` : `sub:${pid}:${qid}`),
    clubScore: (club: string) => (isTest ? `score:test:${club}` : `score:${club}`),
    fastest: (qid: number) => (isTest ? `fastest:test:${qid}` : `fastest:${qid}`),
    fastestLatest: isTest ? "fastest:test:latest" : "fastest:latest",
    // Deterministic per-question speed ranking: a JSON array of correct
    // submissions ordered by (responseTimeMs, submittedAt, participantId).
    // Rank 1/2/3 earn +3/+2/+1 speed bonus; the array is frozen once the
    // question leaves LIVE (no new submissions can mutate it).
    rank: (qid: number) => (isTest ? `rank:test:${qid}` : `rank:${qid}`),
  };
}

function getQuestionSet(mode: QuizMode): QuestionItem[] {
  return mode === "test" ? TEST_QUESTIONS : QUESTIONS;
}

function getQuestionCount(mode: QuizMode): number {
  return getQuestionSet(mode).length;
}

function getQuestionIds(mode: QuizMode): number[] {
  return getQuestionSet(mode).map((q) => q.id);
}

function getQuestion(qNum: number | null | undefined, mode: QuizMode = "live"): QuestionItem | null {
  const set = getQuestionSet(mode);
  const n = Number(qNum);
  if (!Number.isFinite(n) || n <= 0) return null;
  return set.find((q) => q.questionNumber === n) ?? set[0] ?? null;
}

// ── Session Tokens (carry the per-mode session generation) ───────────────────

function encodeToken(p: { id: number; name: string; club: string; gen: number }): string {
  return Buffer.from(JSON.stringify({ id: p.id, name: p.name, club: p.club, gen: p.gen, t: Date.now() })).toString("base64url");
}

function decodeToken(token: string): { id: number; name: string; club: string; gen: number } | null {
  if (!token) return null;
  for (const encoding of ["base64url", "base64"] as const) {
    try {
      const raw = Buffer.from(token, encoding).toString("utf8");
      const d = JSON.parse(raw);
      if (d?.name && d?.club) {
        return { id: Number(d.id) || 1, name: String(d.name), club: String(d.club), gen: Number(d.gen) || 0 };
      }
    } catch (_) {}
  }
  return null;
}

// ── Session Generation (server-side global student logout) ───────────────────
// Every mode keeps a "current session generation". Student tokens are minted
// with the generation active at registration time. When the host logs out all
// students, the generation is bumped and every token from an older generation
// becomes invalid server-side — an old localStorage token can never re-enter.

async function getSessionGen(mode: QuizMode): Promise<number> {
  const raw = await redis.get<string>(quizKeys(mode).sessionGen);
  const n = raw ? parseInt(String(raw), 10) : 0;
  return n > 0 ? n : 1;
}

async function bumpSessionGen(mode: QuizMode): Promise<number> {
  const key = quizKeys(mode).sessionGen;
  const current = await getSessionGen(mode);
  const gen = Math.max(Date.now(), current + 1);
  await redis.set(key, String(gen));
  return gen;
}

// ── State Management (Redis-backed, scoped per mode) ─────────────────────────

class RedisUnavailableError extends Error {
  constructor() {
    super("Redis state store is unreachable");
    this.name = "RedisUnavailableError";
  }
}

/**
 * The Upstash store is reachable but its free-tier REQUEST QUOTA is exhausted
 * ("ERR max requests limit exceeded", 500k commands/month). Distinct from
 * RedisUnavailableError so the host is told the actual remedy (add a payment
 * method to auto-upgrade, or create a new database) rather than a generic
 * outage message.
 */
class RedisQuotaExceededError extends Error {
  constructor() {
    super("Upstash Redis request quota exhausted (free-tier 500k/month limit reached)");
    this.name = "RedisQuotaExceededError";
  }
}

/**
 * Server-authoritative auto-transitions applied on every state read:
 * COUNTDOWN (5s) -> LIVE (30s) once countdownEndsAt passes, and LIVE -> LOCKED
 * once questionEndsAt passes. Mutates and returns the given state.
 */
/**
 * Seconds to keep the answer visible on screen before auto-advancing to the
 * next question. Gives the audience a brief moment to see the correct answer.
 */
const REVEAL_DISPLAY_SECONDS = 5;

function applyAutoTransitions(state: QuizSessionState, mode: QuizMode = "live"): QuizSessionState {
  // 1. Auto-transition COUNTDOWN (5s) -> LIVE (15/30/45s). The server is the
  // sole authority on when the question actually starts — the student's device
  // clock is never used to gate submissions.
  if (state.status === "COUNTDOWN" && state.countdownEndsAt) {
    if (new Date(state.countdownEndsAt).getTime() <= Date.now()) {
      state.status = "LIVE";
      state.questionStartedAt = new Date().toISOString();
      state.countdownEndsAt = null;
      const dur = questionDurationSeconds(state.currentQuestionId, mode);
      state.questionEndsAt = new Date(Date.now() + dur * 1000).toISOString();
      state.durationSeconds = dur;
      state.updatedAt = new Date().toISOString();
    }
  }

  // 2. Auto-transition LIVE -> REVEALED (skip LOCKED) when timer expires.
  //    The correct answer is stored so the projector can display it.
  if (state.status === "LIVE" && state.questionEndsAt) {
    if (new Date(state.questionEndsAt).getTime() <= Date.now()) {
      const q = getQuestion(state.currentQuestionId, mode);
      state.status = "REVEALED";
      state.correctAnswer = q?.correctAnswer ?? null;
      state.questionEndsAt = null;
      state.updatedAt = new Date().toISOString();
    }
  }

  // 3. Auto-transition REVEALED -> WAITING (next question) after a brief
  //    display window so the audience can see the correct answer.
  if (state.status === "REVEALED" && state.updatedAt) {
    const revealedMs = new Date(state.updatedAt).getTime();
    if (Date.now() - revealedMs >= REVEAL_DISPLAY_SECONDS * 1000) {
      const nextNum = Math.min((state.currentQuestionId || 1) + 1, getQuestionCount(mode));
      state.status = "WAITING";
      state.currentQuestionId = nextNum;
      state.questionStartedAt = null;
      state.countdownEndsAt = null;
      state.questionEndsAt = null;
      state.correctAnswer = null;
      state.updatedAt = new Date().toISOString();
    }
  }

  return state;
}

function parseState(raw: string | null | undefined): QuizSessionState | null {
  if (!raw) return null;
  try {
    const s = typeof raw === "string" ? JSON.parse(raw) : raw;
    return s && typeof s === "object" ? (s as QuizSessionState) : null;
  } catch (_) {
    return null;
  }
}

async function getState(mode: QuizMode = "live"): Promise<QuizSessionState> {
  const raw = await redis.get<string>(quizKeys(mode).state);
  if (raw === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
  return materializeState(mode, parseState(raw));
}

/**
 * Apply server-authoritative auto-transitions to a parsed state, persist any
 * transition, and push it to realtime clients (without them polling). Callers
 * that already read the raw state in a pipeline use this instead of getState()
 * so the transition + broadcast logic lives in exactly one place.
 */
async function materializeState(mode: QuizMode, parsed: QuizSessionState | null): Promise<QuizSessionState> {
  if (!parsed) return { ...DEFAULT_STATE };
  const before = JSON.stringify(parsed);
  const next = applyAutoTransitions(parsed, mode);
  // Only persist when a transition actually happened.
  if (JSON.stringify(next) !== before) {
    await redis.set(quizKeys(mode).state, JSON.stringify(next));
    // Realtime: tell clients the state changed without them polling. Auto
    // transitions (COUNTDOWN→LIVE→REVEALED→WAITING) are server-authoritative
    // timing events — exactly what Socket.IO is for. Clubs/counts are
    // untouched by these transitions, so a session+question payload is enough.
    const currentQ = getQuestion(next.currentQuestionId, mode);
    const safeQ =
      next.status === "PREPARING" || next.status === "WAITING" || next.status === "FINISHED"
        ? null
        : sanitizeQuestion(currentQ);
    emitRealtime(mode, "quiz:state", {
      session: { ...next, currentQuestion: safeQ },
      currentQuestion: safeQ,
    });
  }
  return next;
}

async function setState(mode: QuizMode, patch: Partial<QuizSessionState>): Promise<QuizSessionState> {
  const current = await getState(mode);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await redis.set(quizKeys(mode).state, JSON.stringify(next));
  return next;
}

// ── Realtime broadcast helpers ───────────────────────────────────────────────
// Every state change publishes a quiz:state snapshot over Socket.IO so clients
// update instantly without polling. On Vercel (no attached socket server) these
// are cheap no-ops and the REST polling fallback carries the quiz. The payloads
// are sanitized exactly like the equivalent REST endpoints (no correct answers
// before reveal, no scoring internals to students).

/**
 * Broadcast the authoritative quiz state to every client in a mode.
 * `state` may be supplied by the caller (already fetched); otherwise a single
 * state read is done. One extra pipelined round-trip fetches club scores and
 * the participant count for the snapshot.
 */
async function publishState(mode: QuizMode, state?: QuizSessionState) {
  let s = state;
  if (!s) {
    s = await getState(mode);
  }
  const keys = quizKeys(mode);
  const results = await redisPipeline([
    ["GET", keys.clubScore("STACK_PUSH")],
    ["GET", keys.clubScore("IT_INNOVATORS")],
    ["SCARD", keys.participantTokens],
  ]);
  const [stackRaw, innovRaw, countRaw] = Array.isArray(results)
    ? results
    : [undefined, undefined, undefined];
  const currentQ = getQuestion(s.currentQuestionId, mode);
  const safeQ =
    s.status === "PREPARING" || s.status === "WAITING" || s.status === "FINISHED"
      ? null
      : sanitizeQuestion(currentQ);
  emitRealtime(mode, "quiz:state", {
    session: { ...s, currentQuestion: safeQ },
    currentQuestion: safeQ,
    clubs: [
      { name: "STACK_PUSH", score: stackRaw ? parseInt(String(stackRaw), 10) || 0 : 0 },
      { name: "IT_INNOVATORS", score: innovRaw ? parseInt(String(innovRaw), 10) || 0 : 0 },
    ],
    participantsCount: Number(countRaw) || 0,
  });
}

/** Broadcast live club scores after a submission (2 GETs, 1 round-trip). */
async function publishClubScores(mode: QuizMode) {
  const keys = quizKeys(mode);
  const results = await redisPipeline([
    ["GET", keys.clubScore("STACK_PUSH")],
    ["GET", keys.clubScore("IT_INNOVATORS")],
  ]);
  const [stackRaw, innovRaw] = Array.isArray(results)
    ? results
    : [undefined, undefined];
  emitRealtime(mode, "leaderboard:update", {
    clubs: [
      { name: "STACK_PUSH", score: stackRaw ? parseInt(String(stackRaw), 10) || 0 : 0 },
      { name: "IT_INNOVATORS", score: innovRaw ? parseInt(String(innovRaw), 10) || 0 : 0 },
    ],
  });
}

function parseHGetAll(res: any): any[] {
  if (!res) return [];
  const list: any[] = [];
  if (Array.isArray(res)) {
    for (let i = 0; i < res.length; i++) {
      const val = res[i];
      if (!val) continue;
      if (typeof val === "object" && val.name) {
        list.push(val);
        continue;
      }
      if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
        try {
          const item = JSON.parse(val);
          if (item && item.name) list.push(item);
        } catch (_) {}
      }
    }
    return list;
  }
  if (typeof res === "object") {
    for (const val of Object.values(res)) {
      if (!val) continue;
      if (typeof val === "object" && (val as any).name) {
        list.push(val);
        continue;
      }
      if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
        try {
          const item = JSON.parse(val);
          if (item && item.name) list.push(item);
        } catch (_) {}
      }
    }
    return list;
  }
  return [];
}

async function isTokenKicked(token: string, mode: QuizMode = "live"): Promise<boolean> {
  const res = await redisCommand(["SISMEMBER", quizKeys(mode).kickedTokens, token]);
  return res === 1;
}

async function getParticipant(token: string, mode: QuizMode = "live") {
  const currentGen = await getSessionGen(mode);
  const keys = quizKeys(mode);

  // 0. Individually kicked participants are permanently removed: their token
  // lives in the per-mode kicked set, so neither the roster, the key, nor the
  // token-decoding fallback can ever resurrect them.
  if (await isTokenKicked(token, mode)) return null;

  // 1. Check Hash
  const hashRaw = await redisCommand(["HGET", keys.participantsMap, token]);
  if (hashRaw) {
    try {
      const p = typeof hashRaw === "string" ? JSON.parse(hashRaw) : hashRaw;
      if (p?.name) {
        if ((Number(p.gen) || 0) !== currentGen) return null;
        return p;
      }
    } catch (_) {}
  }
  // 2. Check Key
  const raw = await redis.get<string>(keys.participantKey(token));
  if (raw) {
    try {
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (p?.name) {
        if ((Number(p.gen) || 0) !== currentGen) return null;
        await redisCommand(["HSET", keys.participantsMap, token, JSON.stringify(p)]);
        return p;
      }
    } catch (_) {}
  }
  // 3. Fallback: decode token (only valid for the current session generation)
  const d = decodeToken(token);
  if (d && d.gen === currentGen) {
    const p = {
      id: d.id,
      name: d.name,
      club: d.club,
      sessionToken: token,
      gen: d.gen,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      attemptCount: 0,
      correctResponseMs: 0,
      totalResponseMs: 0,
      basePoints: 0,
      speedBonusPoints: 0,
      joinedAt: new Date().toISOString(),
    };
    await saveParticipant(p, mode);
    return p;
  }
  return null;
}

/**
 * Determine the correct rejection for a participant token that failed
 * getParticipant(): kicked students get 401 PARTICIPANT_KICKED, students from
 * a superseded session generation get 401 SESSION_EXPIRED, anything else 404.
 */
async function participantRejection(token: string, mode: QuizMode = "live") {
  if (await isTokenKicked(token, mode)) {
    return { status: 401 as const, code: "PARTICIPANT_KICKED" as const, error: "You were removed by the host." };
  }
  const d = decodeToken(token);
  if (d && d.gen !== (await getSessionGen(mode))) {
    return { status: 401 as const, code: "SESSION_EXPIRED" as const, error: "Your session was ended by the host." };
  }
  return { status: 404 as const, error: "Participant not found" };
}

/**
 * Atomically remove a SINGLE participant. Only that participant's session and
 * records are touched: the roster entry, their participant key, and their
 * submissions are deleted and their token is added to the kicked set. Club
 * totals, quiz state, the session generation, and every other student are
 * intentionally untouched.
 */
async function kickParticipant(mode: QuizMode, token: string, p: any) {
  const keys = quizKeys(mode);
  await redisCommand(["SADD", keys.kickedTokens, token]);
  await redisCommand(["EXPIRE", keys.kickedTokens, 86400]);
  await redisCommand(["HDEL", keys.participantsMap, token]);
  await redisCommand(["SREM", keys.participantTokens, token]);
  await redisCommand(["SREM", keys.nameIndex, keys.nameKey(p.name, p.club)]);
  await redisCommand(["DEL", keys.participantKey(token)]);
  const toDelete = getQuestionIds(mode).map((qid) => keys.submission(p.id, qid));
  await delKeys(toDelete);
}

async function saveParticipant(p: any, mode: QuizMode = "live") {
  const keys = quizKeys(mode);
  const jsonStr = JSON.stringify(p);
  await redis.set(keys.participantKey(p.sessionToken), jsonStr, { ex: 86400 });
  await redisCommand(["HSET", keys.participantsMap, p.sessionToken, jsonStr]);
  await redisCommand(["SADD", keys.participantTokens, p.sessionToken]);
  await redisCommand(["SADD", keys.nameIndex, keys.nameKey(p.name, p.club)]);
}

/**
 * Number of currently registered participants in a mode. The participantTokens
 * set is the canonical roster: it is SADDed on register, SREM'd on kick, and
 * deleted on a fresh wipe, so SCARD is an accurate live count.
 */

// ── Atomically save a submission AND maintain the per-question fastest-finger
// ranking ─────────────────────────────────────────────────────────────────────
// Runs as a single atomic unit on Redis (and mirrored in the in-memory store).
//
// KEYS[1] = submission key            (SET NX — duplicate guard)
// KEYS[2] = rank list key             (JSON array of correct submissions)
// KEYS[3] = fastest tap key           (rank-1 record for the "fastest tap" UI)
// KEYS[4] = fastestLatest key         (rank-1 record for the leaderboard)
// ARGV[1] = full submission JSON      ({ ... , isCorrect, pointsAwarded })
// ARGV[2] = rank detail JSON          (correct answers only; "" for wrong)
//
// Returns (JSON-encoded object):
//   { status: "OK", rank, speedBonus } — submission saved; rank is the
//     participant's deterministic position among correct answers (1-based;
//     0 for wrong answers), speedBonus is +3/+2/+1/0 by rank.
//   "DUPLICATE" — the participant already submitted for this question; the
//     ranking and fastest records are NEVER touched in this case, so a
//     rejected duplicate can never hijack the leaderboard.
//
// The ranking is fully deterministic: (responseTimeMs ASC, submittedAt ASC,
// participantId ASC). Because it lives in ONE atomic script, two answers
// arriving in the same instant still receive distinct, server-ordered ranks —
// only one answer can ever hold rank 1/2/3.
const SUBMIT_LUA = `
local saved = redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400, 'NX')
if not saved then
  return 'DUPLICATE'
end
if ARGV[2] == '' then
  -- Wrong answer: no speed ranking, no fastest-tap update.
  return cjson.encode({ status = 'OK', rank = 0, speedBonus = 0 })
end
-- Correct answer: insert into the deterministic per-question ranking.
local list = {}
local cur = redis.call('GET', KEYS[2])
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if ok and type(obj) == 'table' then list = obj end
end
local entry = cjson.decode(ARGV[2])
local inserted = false
for i, e in ipairs(list) do
  if not inserted then
    local t = tonumber(entry.responseTimeMs) - tonumber(e.responseTimeMs)
    local tsCmp = 0
    if t == 0 then
      if (entry.submittedAt or '') < (e.submittedAt or '') then tsCmp = -1
      elseif (entry.submittedAt or '') > (e.submittedAt or '') then tsCmp = 1 end
    end
    local idCmp = 0
    if t == 0 and tsCmp == 0 then
      idCmp = tonumber(entry.participantId) - tonumber(e.participantId)
    end
    if t < 0 or (t == 0 and (tsCmp < 0 or (tsCmp == 0 and idCmp < 0))) then
      table.insert(list, i, entry)
      inserted = true
      break
    end
  end
end
if not inserted then table.insert(list, entry) end
for i, e in ipairs(list) do
  e.rank = i
  e.speedBonus = i == 1 and 3 or (i == 2 and 2 or (i == 3 and 1 or 0))
end
redis.call('SET', KEYS[2], cjson.encode(list), 'EX', 86400)
local fastest = list[1]
redis.call('SET', KEYS[3], cjson.encode(fastest), 'EX', 86400)
redis.call('SET', KEYS[4], cjson.encode(fastest), 'EX', 86400)
return cjson.encode({ status = 'OK', rank = tonumber(entry.rank), speedBonus = tonumber(entry.speedBonus) })
`;

// ── Mode-scoped data cleanup ─────────────────────────────────────────────────

async function delKeys(keys: string[]) {
  const BATCH = 400;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    if (chunk.length > 0) {
      await redisCommand(["DEL", ...chunk]);
    }
  }
}

async function clearModeData(mode: QuizMode) {
  const keys = quizKeys(mode);
  const rawMap = await redisCommand(["HGETALL", keys.participantsMap]);
  const mapParticipants = parseHGetAll(rawMap);
  const rawTokens = (await redisCommand(["SMEMBERS", keys.participantTokens])) || [];
  const tokens = Array.isArray(rawTokens) ? rawTokens : [];

  const ids = new Set<number>();
  for (const p of mapParticipants) if (p?.id) ids.add(Number(p.id));
  for (const tok of tokens) {
    const p = mapParticipants.find((x) => x?.sessionToken === tok);
    if (p?.id) ids.add(Number(p.id));
  }

  const toDelete: string[] = [];
  for (const id of ids) {
    for (const qid of getQuestionIds(mode)) {
      toDelete.push(keys.submission(id, qid));
    }
  }
  for (const tok of tokens) toDelete.push(keys.participantKey(tok));
  await delKeys(toDelete);

  await redisCommand(["DEL", keys.participantsMap, keys.participantTokens]);
  await redisCommand(["DEL", keys.nameIndex]);
  await redis.set(keys.clubScore("STACK_PUSH"), "0");
  await redis.set(keys.clubScore("IT_INNOVATORS"), "0");
  await redisCommand(["DEL", keys.state, keys.nextId, keys.sessionGen, keys.kickedTokens]);
  await delKeys(getQuestionIds(mode).flatMap((qid) => [keys.fastest(qid), keys.rank(qid)]));
  await redisCommand(["DEL", keys.fastestLatest]);
}

// Log out every student in a mode: bump the session generation (invalidating
// every existing token), remove participant records/roster/submissions, and
// zero the club scores derived from those participants. Quiz state (status /
// current question) is intentionally left untouched.
async function logoutAllStudents(mode: QuizMode) {
  const keys = quizKeys(mode);
  const gen = await bumpSessionGen(mode);

  const rawMap = await redisCommand(["HGETALL", keys.participantsMap]);
  const mapParticipants = parseHGetAll(rawMap);
  const rawTokens = (await redisCommand(["SMEMBERS", keys.participantTokens])) || [];
  const tokens = Array.isArray(rawTokens) ? rawTokens : [];

  const allTokens = new Set<string>();
  for (const p of mapParticipants) if (p?.sessionToken) allTokens.add(p.sessionToken);
  for (const t of tokens) allTokens.add(t);

  const ids = new Set<number>();
  for (const p of mapParticipants) if (p?.id) ids.add(Number(p.id));

  const toDelete: string[] = [];
  for (const id of ids) {
    for (const qid of getQuestionIds(mode)) {
      toDelete.push(keys.submission(id, qid));
    }
  }
  for (const tok of allTokens) toDelete.push(keys.participantKey(tok));
  await delKeys(toDelete);

  await redisCommand(["DEL", keys.participantsMap, keys.participantTokens, keys.kickedTokens]);
  await redisCommand(["DEL", keys.nameIndex]);
  await redis.set(keys.clubScore("STACK_PUSH"), "0");
  await redis.set(keys.clubScore("IT_INNOVATORS"), "0");
  await delKeys(getQuestionIds(mode).flatMap((qid) => [keys.fastest(qid), keys.rank(qid)]));
  await redisCommand(["DEL", keys.fastestLatest]);

  return gen;
}

// ── Sanitizers: never send correct answers / scoring internals to students ──

function sanitizeQuestion(q: QuestionItem | null | undefined) {
  if (!q) return null;
  const { correctAnswer, ...safe } = q;
  return safe;
}

function sanitizeSubmission(sub: any) {
  if (!sub) return sub;
  const { isCorrect, pointsAwarded, ...safe } = sub;
  return safe;
}

/**
 * Server-authoritative team results.
 *
 * teamScore = Σ participant earned points (base + speed bonus). It is computed
 * from the SAME participant records that feed the scoreboard, so the displayed
 * totals and the winner logic can never disagree (the historical bug where the
 * UI showed e.g. 152 vs 329 but the winner calculation picked the wrong club).
 *
 * Eligibility (team participation):
 *   requiredMembers    = every registered participant of the club
 *   contributedMembers = participants with at least one accepted submission
 *   eligible           = contributedMembers === requiredMembers (and > 0)
 * Joining, viewing, or an invalid/duplicate submission never counts as a
 * contribution. A club can win only when EVERY member has contributed.
 *
 * Winner: the eligible team with the highest teamScore. Tie-break 1: most
 * total correct answers. Tie-break 2: lowest aggregate response time among
 * valid correct answers. If still exactly equal: "TIE" — never random.
 */
export function computeTeamResults(participants: any[]) {
  const clubs = ["STACK_PUSH", "IT_INNOVATORS"] as const;
  const results = clubs.map((club) => {
    const members = participants.filter((p) => p?.club === club);
    const requiredMembers = members.length;
    const contributedMembers = members.filter((p) => (Number(p?.attemptCount) || 0) > 0).length;
    const eligible = requiredMembers > 0 && contributedMembers === requiredMembers;
    return {
      club,
      score: members.reduce((sum, p) => sum + (Number(p?.score) || 0), 0),
      basePoints: members.reduce((sum, p) => sum + (Number(p?.basePoints) || 0), 0),
      speedBonus: members.reduce((sum, p) => sum + (Number(p?.speedBonusPoints) || 0), 0),
      correctAnswers: members.reduce((sum, p) => sum + (Number(p?.correctCount) || 0), 0),
      totalCorrectResponseMs: members.reduce((sum, p) => sum + (Number(p?.correctResponseMs) || 0), 0),
      requiredMembers,
      contributedMembers,
      eligible,
    };
  });

  const eligibleResults = results.filter((r) => r.eligible);
  let winner: string | null = null;
  if (eligibleResults.length > 0) {
    const sorted = [...eligibleResults].sort(
      (a, b) =>
        b.score - a.score ||
        b.correctAnswers - a.correctAnswers ||
        a.totalCorrectResponseMs - b.totalCorrectResponseMs,
    );
    const top = sorted[0];
    const tied = sorted.filter(
      (r) =>
        r.score === top.score &&
        r.correctAnswers === top.correctAnswers &&
        r.totalCorrectResponseMs === top.totalCorrectResponseMs,
    );
    winner = tied.length > 1 ? "TIE" : top.club;
  }

  return { results, winner };
}

// ── Express App ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Body parser — handles Vercel pre-parsed bodies
app.use((req, _res, next) => {
  if (typeof req.body === "string" && req.body) {
    try { req.body = JSON.parse(req.body); } catch (_) {}
    return next();
  }
  if (req.body && typeof req.body === "object") return next();
  express.json()(req, _res, next);
});

const ADMIN_PW = process.env.ADMIN_PASSWORD || "MadeBySagar";
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PW, 10);

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const pw = req.headers["x-admin-password"] as string;
  if (pw !== ADMIN_PW && !bcrypt.compareSync(pw || "", ADMIN_HASH)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const r = express.Router();

// ── Health (shared across modes) ──────────────────────────────────────────────
r.get("/health", async (_req, res) => {
  try {
    const pong = await redis.ping();
    const s = await getState("live");
    res.json({ ok: true, status: s.status, redis: pong });
  } catch (e: any) {
    res.status(e?.name === "RedisQuotaExceededError" ? 503 : 200).json({
      ok: false,
      redis: false,
      error: e?.message || "Redis check failed",
      code: e?.name === "RedisQuotaExceededError" ? "REDIS_QUOTA_EXCEEDED" : undefined,
    });
  }
});

// ── Admin Auth (shared across modes) ─────────────────────────────────────────
r.post("/admin/login", (req, res) => {
  const { password } = req.body ?? {};
  if (!password || !bcrypt.compareSync(String(password), ADMIN_HASH)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  res.json({ ok: true, token: ADMIN_PW });
});

/**
 * Realtime transition pump — server-authoritative timer pushes.
 *
 * The client renders the countdown locally from absolute timestamps, but the
 * server must still ADVANCE the state machine (COUNTDOWN→LIVE→REVEALED→WAITING)
 * and broadcast each step so nobody has to poll to discover a transition. On a
 * persistent host this schedules a single setTimeout per transition; when it
 * fires it materializes state (emitting quiz:state) and chains the next step.
 * Skipped entirely on Vercel (no reliable timers) and in tests — there the
 * lazy-transition-on-read path handles everything exactly as before.
 */
const realtimePumps = new Set<string>();

function scheduleTransitionPump(mode: QuizMode, state: QuizSessionState) {
  if (!isRealtimeAttached()) return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const now = Date.now();
  let nextAt: number | null = null;
  if (state.status === "COUNTDOWN" && state.countdownEndsAt) {
    nextAt = new Date(state.countdownEndsAt).getTime();
  } else if (state.status === "LIVE" && state.questionEndsAt) {
    nextAt = new Date(state.questionEndsAt).getTime();
  } else if (state.status === "REVEALED") {
    nextAt = now + REVEAL_DISPLAY_SECONDS * 1000;
  }
  if (nextAt === null || nextAt <= now) return;
  const key = mode;
  if (realtimePumps.has(key)) return;
  realtimePumps.add(key);
  const delay = Math.max(0, nextAt - now) + 60; // small buffer past the mark
  setTimeout(async () => {
    realtimePumps.delete(key);
    try {
      const s = await getState(mode); // materializes + broadcasts if changed
      scheduleTransitionPump(mode, s); // chain to the next transition
    } catch (_) {
      /* state store hiccup — the next read will materialize anyway */
    }
  }, delay);
}

/**
 * Register every quiz route for one mode. The live quiz uses prefix "" and
 * mode "live"; the test mode uses prefix "/test" and mode "test". Both modes
 * share the exact same engine/handlers but are scoped to their own Redis
 * namespace and session generation, so they can never interfere with each
 * other.
 */
function registerModeRoutes(router: express.Router, prefix: string, mode: QuizMode) {
  // ── Admin Actions ───────────────────────────────────────────────────────────
  router.post(`${prefix}/admin/start-countdown`, requireAdmin, async (req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "COUNTDOWN")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> COUNTDOWN` });
    }
    const { questionNumber } = req.body ?? {};
    const q = getQuestion(Number(questionNumber) || cur.currentQuestionId || 1, mode);
    if (!q) return res.status(400).json({ error: "Question not found" });
    const now = Date.now();
    const endsAt = new Date(now + COUNTDOWN_SECONDS * 1000).toISOString();
    const dur = questionDurationSeconds(q.questionNumber, mode);
    const qEndsAt = new Date(now + (COUNTDOWN_SECONDS + dur) * 1000).toISOString();
    const state = await setState(mode, {
      status: "COUNTDOWN",
      currentQuestionId: q.questionNumber,
      countdownEndsAt: endsAt,
      questionEndsAt: qEndsAt,
      durationSeconds: dur,
      questionStartedAt: null,
      correctAnswer: null,
    });
    await publishState(mode, state);
    scheduleTransitionPump(mode, state);
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/start-question`, requireAdmin, async (req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "LIVE")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> LIVE` });
    }
    const { questionNumber } = req.body ?? {};
    const q = getQuestion(Number(questionNumber) || cur.currentQuestionId || 1, mode);
    if (!q) return res.status(400).json({ error: "Question not found" });
    const now = Date.now();
    const dur = questionDurationSeconds(q.questionNumber, mode);
    const state = await setState(mode, {
      status: "LIVE",
      currentQuestionId: q.questionNumber,
      questionStartedAt: new Date(now).toISOString(),
      countdownEndsAt: null,
      questionEndsAt: new Date(now + dur * 1000).toISOString(),
      durationSeconds: dur,
      correctAnswer: null,
    });
    await publishState(mode, state);
    scheduleTransitionPump(mode, state);
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/lock-answers`, requireAdmin, async (_req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "LOCKED")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> LOCKED` });
    }
    const state = await setState(mode, { status: "LOCKED" });
    await publishState(mode, state);
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/reveal-answer`, requireAdmin, async (_req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "REVEALED")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> REVEALED` });
    }
    const q = getQuestion(cur.currentQuestionId, mode);
    const state = await setState(mode, { status: "REVEALED", correctAnswer: q?.correctAnswer ?? null });
    await publishState(mode, state);
    // Projector/display clients get the reveal pushed immediately.
    emitRealtime(mode, "display:reveal", { correctAnswer: state.correctAnswer });
    scheduleTransitionPump(mode, state);
    res.json({ ok: true, state, correctAnswer: state.correctAnswer });
  });

  router.post(`${prefix}/admin/next-question`, requireAdmin, async (req, res) => {
    const cur = await getState(mode);
    const { questionNumber } = req.body ?? {};
    const next = questionNumber ? Number(questionNumber) : Math.min((cur.currentQuestionId || 1) + 1, getQuestionCount(mode));
    const state = await setState(mode, {
      status: "WAITING",
      currentQuestionId: next,
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
    });
    await publishState(mode, state);
    res.json({ ok: true, state });
  });

  /**
   * Individual student kick (atomic, server-side). Only the targeted
   * participant's session is invalidated — nobody else, not even their club
   * totals, the quiz state, or the admin session are affected. The kicked
   * student's next request receives 401 PARTICIPANT_KICKED and can never
   * re-enter with the old token; they must register again.
   */
  router.post(`${prefix}/admin/kick-participant`, requireAdmin, async (req, res) => {
    const { token } = req.body ?? {};
    if (!token) return res.status(400).json({ error: "token required" });
    const p = await getParticipant(String(token), mode);
    if (!p) {
      const rejection = await participantRejection(String(token), mode);
      return res.status(rejection.status).json({ error: rejection.error, code: rejection.code });
    }
    await kickParticipant(mode, String(token), p);
    const count = (await redisCommand(["SCARD", quizKeys(mode).participantTokens])) || 0;
    emitRealtime(mode, "participant:left", {
      name: p.name,
      participantsCount: Number(count) || 0,
    });
    await publishState(mode);
    res.json({ ok: true, message: `${p.name} was removed from the quiz.`, participantId: p.id });
  });

  router.post(`${prefix}/admin/prev-question`, requireAdmin, async (_req, res) => {
    const cur = await getState(mode);
    const prev = Math.max((cur.currentQuestionId || 1) - 1, 1);
    const state = await setState(mode, {
      status: "WAITING",
      currentQuestionId: prev,
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
    });
    await publishState(mode, state);
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/select-question`, requireAdmin, async (req, res) => {
    const { questionNumber } = req.body ?? {};
    if (!questionNumber) return res.status(400).json({ error: "questionNumber required" });
    const state = await setState(mode, {
      status: "WAITING",
      currentQuestionId: Number(questionNumber),
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
    });
    await publishState(mode, state);
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/reset-scores`, requireAdmin, async (_req, res) => {
    const keys = quizKeys(mode);
    await redis.set(keys.clubScore("STACK_PUSH"), "0");
    await redis.set(keys.clubScore("IT_INNOVATORS"), "0");

    const rawTokens = (await redisCommand(["SMEMBERS", keys.participantTokens])) || [];
    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
    for (const tok of tokens) {
      const p = await getParticipant(tok, mode);
      if (p) {
        p.score = 0;
        p.correctCount = 0;
        p.wrongCount = 0;
        p.attemptCount = 0;
        p.correctResponseMs = 0;
        p.totalResponseMs = 0;
        p.basePoints = 0;
        p.speedBonusPoints = 0;
        p.lastQuestionId = null;
        p.lastAnswer = null;
        p.lastSubmittedAt = null;
        await redis.set(keys.participantKey(p.sessionToken), JSON.stringify(p), { ex: 86400 });
        for (const qid of getQuestionIds(mode)) {
          await redisCommand(["DEL", keys.submission(p.id, qid)]);
        }
      }
    }
    // Submissions were wiped — the per-question speed rankings derived from
    // them must go too, otherwise a stale ranking could be replayed on a reset.
    await delKeys(getQuestionIds(mode).map((qid) => keys.rank(qid)));

    const state = await setState(mode, {
      status: "PREPARING",
      currentQuestionId: null,
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
    });
    await publishState(mode, state);
    res.json({ ok: true, message: "Scores and responses reset successfully. Participants retained.", state });
  });

  /**
   * Deliberate FRESH EVENT reset — the only action that wipes the roster,
   * submissions, scores, fastest-answer data, and invalidates every existing
   * student session (new session generation). The quiz returns to the clean
   * PREPARING state with NO question selected. A mere admin refresh, page
   * reconnection, or server restart never triggers this.
   */
  router.post(`${prefix}/admin/reset-all-fresh`, requireAdmin, async (_req, res) => {
    await clearModeData(mode);
    await redis.set(quizKeys(mode).nextId, "1");
    await bumpSessionGen(mode);
    const state = await setState(mode, {
      status: "PREPARING",
      currentQuestionId: null,
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
      // A fresh event starts with the portal CLOSED — students cannot join
      // until the host explicitly opens it.
      portalOpen: false,
    });
    await publishState(mode, state);
    res.json({ ok: true, message: "All data cleared — fresh event is in PREPARING state", state });
  });

  router.post(`${prefix}/admin/end-quiz`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { status: "FINISHED" });
    await publishState(mode, state);
    emitRealtime(mode, "quiz:finished", { mode });
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/logout-all-students`, requireAdmin, async (_req, res) => {
    const gen = await logoutAllStudents(mode);
    emitRealtime(mode, "participant:left", { name: null, participantsCount: 0 });
    await publishState(mode);
    res.json({ ok: true, message: "All students logged out. Their sessions are now invalid.", sessionGeneration: gen });
  });

  // ── Student Portal Gate (registration on/off) ───────────────────────────────
  // While the portal is closed, new students cannot register or join. The host
  // opens it when ready (e.g. right before the event) and can close it again
  // (e.g. after everyone is in) to stop late logins.
  router.post(`${prefix}/admin/open-portal`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { portalOpen: true });
    await publishState(mode, state);
    res.json({ ok: true, portalOpen: true, state });
  });

  router.post(`${prefix}/admin/close-portal`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { portalOpen: false });
    await publishState(mode, state);
    res.json({ ok: true, portalOpen: false, state });
  });

  router.get(`${prefix}/admin/summary`, requireAdmin, async (_req, res) => {
    const keys = quizKeys(mode);
    // Batch the state, club scores and roster into ONE Redis round-trip.
    const results = await redisPipeline([
      ["GET", keys.state],
      ["GET", keys.clubScore("STACK_PUSH")],
      ["GET", keys.clubScore("IT_INNOVATORS")],
      ["HGETALL", keys.participantsMap],
    ]);
    if (results === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
    const [stateRaw, stackRaw, innovRaw, rawMap] = Array.isArray(results) ? results : [undefined, undefined, undefined, undefined];

    let state: QuizSessionState;
    const parsedState = parseState(stateRaw as string | null);
    if (!parsedState) {
      state = { ...DEFAULT_STATE };
    } else {
      const before = JSON.stringify(parsedState);
      state = applyAutoTransitions(parsedState, mode);
      if (JSON.stringify(state) !== before) {
        await redis.set(keys.state, JSON.stringify(state));
        const currentQtx = getQuestion(state.currentQuestionId, mode);
        const safeQtx =
          state.status === "PREPARING" || state.status === "WAITING" || state.status === "FINISHED"
            ? null
            : sanitizeQuestion(currentQtx);
        emitRealtime(mode, "quiz:state", {
          session: { ...state, currentQuestion: safeQtx },
          currentQuestion: safeQtx,
        });
      }
    }
    const currentQ = getQuestion(state.currentQuestionId, mode);
    const stackScore = stackRaw ? parseInt(String(stackRaw), 10) || 0 : 0;
    const innovScore = innovRaw ? parseInt(String(innovRaw), 10) || 0 : 0;

    // Get all registered participants from Hash (with fallback to set)
    let participants: any[] = parseHGetAll(rawMap);

    if (participants.length === 0) {
      const rawTokens = (await redisCommand(["SMEMBERS", quizKeys(mode).participantTokens])) || [];
      const tokens = Array.isArray(rawTokens) ? rawTokens : [];
      participants = (
        await Promise.all(
          tokens.map(async (tok) => {
            try {
              return await getParticipant(tok, mode);
            } catch (_) {
              return null;
            }
          })
        )
      ).filter((p: any) => p && p.name);
    }

    // Deduplicate participants
    const seen = new Set<string | number>();
    participants = participants.filter((p) => {
      const key = p.sessionToken || p.id || p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch every participant's submission for the current question in ONE
    // batched round-trip instead of N sequential/concurrent calls.
    let currentSubmissions: any[] = [];
    if (currentQ) {
      const subResults =
        participants.length > 0
          ? await redisPipeline(participants.map((p) => ["GET", keys.submission(p.id, currentQ.id)]))
          : [];
      if (Array.isArray(subResults)) {
        currentSubmissions = subResults
          .map((subRaw: any) => {
            if (!subRaw) return null;
            try {
              return typeof subRaw === "string" ? JSON.parse(subRaw) : subRaw;
            } catch (_) {
              return null;
            }
          })
          .filter(Boolean);
      }
    }

    const stackParticipants = participants.filter((p) => p.club === "STACK_PUSH");
    const innovatorsParticipants = participants.filter((p) => p.club === "IT_INNOVATORS");

    // Fastest-finger breakdown for the current question — shown to the admin
    // after reveal (BASE POINTS / FASTEST +3 / SECOND +2 / THIRD +1 / others).
    let questionBreakdown = null;
    if (currentQ) {
      const rankRaw = await redis.get<string>(quizKeys(mode).rank(currentQ.id));
      if (rankRaw) {
        try {
          const list = typeof rankRaw === "string" ? JSON.parse(rankRaw) : rankRaw;
          if (Array.isArray(list) && list.length > 0) {
            questionBreakdown = {
              questionNumber: currentQ.questionNumber,
              basePoints: currentQ.points,
              correctCount: list.length,
              fastest: list[0] ?? null,
              second: list[1] ?? null,
              third: list[2] ?? null,
              otherCorrectCount: Math.max(0, list.length - 3),
            };
          }
        } catch (_) {}
      }
    }

    res.json({
      session: { ...state, currentQuestion: currentQ },
      currentQuestionId: state.currentQuestionId ?? null,
      clubs: [
        { name: "STACK_PUSH", score: stackScore },
        { name: "IT_INNOVATORS", score: innovScore },
      ],
      participants,
      participantsCount: participants.length,
      stackParticipants,
      innovatorsParticipants,
      stackCount: stackParticipants.length,
      innovatorsCount: innovatorsParticipants.length,
      currentSubmissions,
      answersReceived: currentSubmissions.length,
      answersPending: Math.max(0, participants.length - currentSubmissions.length),
      questionBreakdown,
    });
  });

  // Deterministic participant ordering shared by every leaderboard: score DESC,
  // correct answers DESC, total correct-answer time ASC (faster wins ties),
  // registration time ASC, participant id ASC. Stable tie-breakers mean
  // equal-score students never shuffle between polls.
  function compareParticipants(a: any, b: any): number {
    return (
      (b.score || 0) - (a.score || 0) ||
      (b.correctCount || 0) - (a.correctCount || 0) ||
      (Number(a.correctResponseMs) || 0) - (Number(b.correctResponseMs) || 0) ||
      String(a.joinedAt || "").localeCompare(String(b.joinedAt || "")) ||
      (Number(a.id) || 0) - (Number(b.id) || 0)
    );
  }

  /**
   * Participant/member details page data. Exposes exactly what a host needs
   * during the event: identity, club, registration time, per-participant score
   * breakdown, submission count, whether they answered the current question,
   * and a kick action. Sorted deterministically (score DESC, correct DESC,
   * joinedAt ASC, id ASC). No correct answers or scoring internals leak here.
   */
  router.get(`${prefix}/admin/members`, requireAdmin, async (_req, res) => {
    const state = await getState(mode);
    const currentQ = getQuestion(state.currentQuestionId, mode);
    const rawMap = await redisCommand(["HGETALL", quizKeys(mode).participantsMap]);
    const participants = parseHGetAll(rawMap);

    const seen = new Set<string | number>();
    const unique = participants.filter((p) => {
      const key = p.sessionToken || p.id || p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch every participant's submission for the current question in ONE
    // batched round-trip instead of N concurrent HTTPS calls.
    let submittedByPid = new Map<number, boolean>();
    if (currentQ && unique.length > 0) {
      const subResults = await redisPipeline(unique.map((p) => ["GET", quizKeys(mode).submission(p.id, currentQ.id)]));
      if (Array.isArray(subResults)) {
        submittedByPid = new Map(unique.map((p, i) => [Number(p.id) || 0, !!subResults[i]]));
      }
    }

    const members = unique.map((p) => {
      const submitted = currentQ ? submittedByPid.get(Number(p.id) || 0) ?? false : false;
      return {
        id: Number(p.id) || 0,
        name: String(p.name || ""),
        club: String(p.club || ""),
        joinedAt: p.joinedAt ?? null,
        score: p.score || 0,
        correctCount: p.correctCount || 0,
        wrongCount: p.wrongCount || 0,
        attemptCount: p.attemptCount || 0,
        correctResponseMs: p.correctResponseMs || 0,
        totalResponseMs: p.totalResponseMs || 0,
        basePoints: p.basePoints || 0,
        speedBonusPoints: p.speedBonusPoints || 0,
        submitted,
        // Admin-only endpoint — token needed for the individual kick action.
        sessionToken: String(p.sessionToken || ""),
      };
    });

    members.sort(compareParticipants);
    res.json({
      participants: members,
      count: members.length,
      status: state.status,
      currentQuestionId: currentQ?.id ?? null,
    });
  });

  router.get(`${prefix}/admin/questions`, requireAdmin, (_req, res) => {
    res.json(getQuestionSet(mode));
  });

  /**
   * Developer/admin diagnostics — realtime status + live Redis command
   * counters (in-process; on Vercel they're per-lambda snapshots). No
   * credentials or secrets are exposed.
   */
  router.get(`${prefix}/admin/diagnostics`, requireAdmin, async (_req, res) => {
    const state = await getState(mode);
    const count = (await redisCommand(["SCARD", quizKeys(mode).participantTokens])) || 0;
    res.json({
      mode,
      realtime: {
        attached: isRealtimeAttached(),
        clients: realtimeClientCount(),
      },
      store: {
        memory: USE_MEMORY_STORE,
        redis: await redis.ping().catch(() => null),
      },
      redisCounters: { ...redisCounters },
      state: {
        status: state.status,
        currentQuestionId: state.currentQuestionId,
        portalOpen: state.portalOpen,
        participantsCount: Number(count) || 0,
      },
      now: new Date().toISOString(),
    });
  });

  // ── Public Endpoints ────────────────────────────────────────────────────────
  router.get(`${prefix}/quiz-state`, async (_req, res) => {
    const state = await getState(mode);
    const currentQ = getQuestion(state.currentQuestionId, mode);
    // No question may leak before the host starts the quiz (PREPARING) or
    // between questions (WAITING). During COUNTDOWN the sanitized question IS
    // preloaded so the projector reveals it the instant the countdown ends —
    // in sync with every student device.
    const safeQ =
      state.status === "PREPARING" || state.status === "WAITING" || state.status === "FINISHED"
        ? null
        : sanitizeQuestion(currentQ);
    res.json({ session: { ...state, currentQuestion: safeQ }, currentQuestion: safeQ });
  });

  router.get(`${prefix}/leaderboard`, async (_req, res) => {
    const keys = quizKeys(mode);
    // One batched round-trip for the whole leaderboard instead of 5+.
    const results = await redisPipeline([
      ["HGETALL", keys.participantsMap],
      ["GET", keys.state],
    ]);
    if (results === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
    const [rawMap, stateRaw] = Array.isArray(results) ? results : [undefined, undefined];

    // Deterministic student leaderboard: score DESC, correctCount DESC,
    // joinedAt ASC, id ASC. Stable tie-breakers guarantee equal-score students
    // never randomly reorder between polls.
    const participants = parseHGetAll(rawMap);

    // Authoritative club totals — computed from the SAME participant records
    // that drive the winner calculation, so the displayed team score and the
    // declared winner can never disagree. clubScore keys are only used as the
    // fast realtime-update path during the live quiz.
    const teamResults = computeTeamResults(participants);
    const s = teamResults.results.find((r) => r.club === "STACK_PUSH")?.score ?? 0;
    const i = teamResults.results.find((r) => r.club === "IT_INNOVATORS")?.score ?? 0;
    const sorted = [...participants].sort(compareParticipants);
    const students = sorted.map((p) => ({
      id: Number(p.id) || 0,
      name: String(p.name || ""),
      club: String(p.club || ""),
      score: p.score || 0,
      correctCount: p.correctCount || 0,
      wrongCount: p.wrongCount || 0,
      attemptCount: p.attemptCount || 0,
      correctResponseMs: p.correctResponseMs || 0,
      totalResponseMs: p.totalResponseMs || 0,
      basePoints: p.basePoints || 0,
      speedBonusPoints: p.speedBonusPoints || 0,
      joinedAt: p.joinedAt ?? null,
    }));
    const topStudents = students.slice(0, 3).map((p, idx) => ({ ...p, rank: idx + 1 }));

    let state: QuizSessionState;
    state = await materializeState(mode, parseState(stateRaw as string | null));

    let fastestTap = null;
    const perQuestion = state.currentQuestionId ? await redis.get<string>(keys.fastest(state.currentQuestionId)) : null;
    const rawFastest = perQuestion || (await redis.get<string>(keys.fastestLatest));
    if (rawFastest) {
      try {
        fastestTap = typeof rawFastest === "string" ? JSON.parse(rawFastest) : rawFastest;
      } catch (_) {}
    }

    res.json({
      clubs: [
        { name: "STACK_PUSH", score: s },
        { name: "IT_INNOVATORS", score: i },
      ],
      students,
      topStudents,
      fastestTap,
      // Server-authoritative team standings + winner (eligibility-aware).
      teamResults: teamResults.results,
      teamWinner: teamResults.winner,
    });
  });

  // ── Registration ────────────────────────────────────────────────────────────
  router.post(`${prefix}/participants/register`, async (req, res) => {
    try {
      const { name, club } = req.body ?? {};
      const n = String(name || "").trim();
      if (!n) return res.status(400).json({ error: "Name is required" });
      if (!isValidClub(String(club || ""))) return res.status(400).json({ error: "Valid club required" });

      // Portal gate: no new students may join until the host opens the portal.
      // Already-registered students are unaffected — this only blocks joining.
      const state = await getState(mode);
      if (state.portalOpen !== true) {
        return res.status(403).json({
          code: "PORTAL_CLOSED",
          error: "The student portal is closed. The host hasn't opened registration yet — please wait for the host to open it.",
        });
      }

      const keys = quizKeys(mode);
      const nameKey = keys.nameKey(n, String(club));

      // Concurrency-safe duplicate-name guard: SADD is atomic, so two phones
      // registering the same name+club simultaneously can never both pass —
      // exactly one SADD returns 1 (newly added) and the other gets 0. This
      // replaces the old read-then-write SISMEMBER check that raced under
      // simultaneous joins, and needs no extra SCARD (there is no member cap).
      const nameAdded = await redisCommand(["SADD", keys.nameIndex, nameKey]);
      if (nameAdded !== 1) {
        return res.status(409).json({
          code: "NAME_TAKEN",
          error: `A student named "${n}" is already registered in ${String(club).replace(/_/g, " ")}. If that is you on another device, ask the host to remove the duplicate first.`,
        });
      }

      let participant: any;
      try {
        // INCR (unique id) + session generation in one pipelined round-trip.
        const idGen = await redisPipeline([
          ["INCR", keys.nextId],
          ["GET", keys.sessionGen],
        ]);
        if (idGen === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
        const [nextId, genRaw] = Array.isArray(idGen) ? idGen : [undefined, undefined];
        const id = Number(nextId) || Date.now();
        const gen = (() => {
          const g = genRaw ? parseInt(String(genRaw), 10) : 0;
          return g > 0 ? g : 1;
        })();

        const token = encodeToken({ id, name: n, club: String(club), gen });
        participant = { id, name: n, club, sessionToken: token, gen, score: 0, correctCount: 0, wrongCount: 0, attemptCount: 0, correctResponseMs: 0, totalResponseMs: 0, basePoints: 0, speedBonusPoints: 0, joinedAt: new Date().toISOString() };
        await saveParticipant(participant, mode);
      } catch (err) {
        // Roll the name claim back so a failed registration can retry.
        await redisCommand(["SREM", keys.nameIndex, nameKey]).catch(() => {});
        throw err;
      }

      // Realtime: announce the join + participant count, and publish the new
      // state snapshot so every client updates without polling.
      const count = (await redisCommand(["SCARD", keys.participantTokens])) || 0;
      emitRealtime(mode, "participant:joined", {
        name: n,
        club: String(club),
        participantsCount: Number(count) || 0,
      });
      await publishState(mode, state);
      res.json({ ok: true, participant });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Registration failed" });
    }
  });

  // ── Student Session Poll ────────────────────────────────────────────────────
  router.get(`${prefix}/participants/session`, async (req, res) => {
    const token = String(req.query.token ?? "");
    if (!token) return res.status(400).json({ error: "Missing token" });

    const keys = quizKeys(mode);
    // The entire poll is served from ONE batched Redis round-trip (session
    // generation + kicked-check + participant record + quiz state) instead of
    // 5+ sequential HTTPS calls. With hundreds of students polling every ~1s
    // this cuts Redis traffic by roughly 5x and makes every poll much faster.
    const results = await redisPipeline([
      ["GET", keys.sessionGen],
      ["SISMEMBER", keys.kickedTokens, token],
      ["HGET", keys.participantsMap, token],
      ["GET", keys.state],
    ]);
    if (results === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
    const [genRaw, kicked, hashRaw, stateRaw] = Array.isArray(results) ? results : [undefined, undefined, undefined, undefined];

    const currentGen = (() => {
      const n = genRaw ? parseInt(String(genRaw), 10) : 0;
      return n > 0 ? n : 1;
    })();

    // Kicked students are rejected immediately — no further lookups needed.
    if (kicked === 1) {
      return res.status(401).json({ code: "PARTICIPANT_KICKED", error: "You were removed by the host." });
    }

    // Participant lookup: participants hash first, then participant-key
    // fallback, then pure token decoding (no extra Redis calls on the happy
    // path). Mirrors getParticipant() exactly.
    let participant: any = null;
    if (hashRaw) {
      try {
        const p = typeof hashRaw === "string" ? JSON.parse(hashRaw) : hashRaw;
        if (p?.name) participant = p;
      } catch (_) {}
    }
    if (!participant) {
      const keyRaw = await redis.get<string>(keys.participantKey(token));
      if (keyRaw) {
        try {
          const p = typeof keyRaw === "string" ? JSON.parse(keyRaw) : keyRaw;
          if (p?.name) {
            participant = p;
            await redisCommand(["HSET", keys.participantsMap, token, JSON.stringify(p)]);
          }
        } catch (_) {}
      }
    }
    if (!participant) {
      const d = decodeToken(token);
      if (d && d.gen === currentGen) {
        participant = {
          id: d.id,
          name: d.name,
          club: d.club,
          sessionToken: token,
          gen: d.gen,
          score: 0,
          correctCount: 0,
          wrongCount: 0,
          attemptCount: 0,
          correctResponseMs: 0,
          totalResponseMs: 0,
          basePoints: 0,
          speedBonusPoints: 0,
          joinedAt: new Date().toISOString(),
        };
        await saveParticipant(participant, mode);
      }
    }

    if (!participant) {
      // Rejection without extra Redis calls: decoding the token distinguishes
      // an expired session (old generation) from a genuinely unknown token.
      const d = decodeToken(token);
      if (d && d.gen !== currentGen) {
        return res.status(401).json({ code: "SESSION_EXPIRED", error: "Your session was ended by the host." });
      }
      return res.status(404).json({ error: "Participant not found" });
    }
    if ((Number(participant.gen) || 0) !== currentGen) {
      return res.status(401).json({ code: "SESSION_EXPIRED", error: "Your session was ended by the host." });
    }

    // Quiz state with the same server-authoritative auto-transitions.
    let state: QuizSessionState;
    state = await materializeState(mode, parseState(stateRaw as string | null));

    const currentQ = getQuestion(state.currentQuestionId, mode);
    // hasSubmitted / userSubmission come straight from the participant record
    // (kept in sync by the submission handler), so this poll stays a SINGLE
    // pipelined Redis round-trip — no extra per-student submission GET.
    const hasSubmitted = !!currentQ && Number(participant.lastQuestionId) === currentQ.id;
    // Students never see a question while the host is preparing or between
    // questions. During COUNTDOWN the sanitized question IS preloaded so every
    // device can reveal it at the exact same moment countdownEndsAt passes —
    // no waiting for the next poll + server transition.
    const showQuestion =
      state.status === "LIVE" ||
      state.status === "LOCKED" ||
      state.status === "REVEALED" ||
      state.status === "COUNTDOWN";

    res.json({
      participant: { id: participant.id, name: participant.name, club: participant.club, score: participant.score, correctCount: participant.correctCount, wrongCount: participant.wrongCount || 0, attemptCount: participant.attemptCount, correctResponseMs: participant.correctResponseMs || 0, totalResponseMs: participant.totalResponseMs || 0, basePoints: participant.basePoints || 0, speedBonusPoints: participant.speedBonusPoints || 0, sessionToken: participant.sessionToken },
      hasSubmitted,
      userSubmission:
        hasSubmitted && participant.lastAnswer
          ? {
              answer: String(participant.lastAnswer),
              questionId: currentQ?.id ?? null,
              questionNumber: currentQ?.questionNumber ?? null,
              submittedAt: participant.lastSubmittedAt ?? null,
            }
          : null,
      currentQuestion: showQuestion && currentQ ? sanitizeQuestion(currentQ) : null,
      sessionStatus: state.status,
      countdownEndsAt: state.countdownEndsAt,
      questionEndsAt: state.questionEndsAt,
      durationSeconds: state.durationSeconds || QUESTION_SECONDS,
      correctAnswer: state.status === "REVEALED" ? state.correctAnswer : null,
    });
  });

  // ── Answer Submission ───────────────────────────────────────────────────────
  /**
   * Speed-critical path: a student tap must feel instant even with hundreds of
   * students submitting simultaneously. The whole handler runs in ~3 batched
   * Redis round-trips instead of ~9 sequential HTTPS calls:
   *   1. pipeline: session generation + kicked-check + participant record +
   *      quiz state (one request)
   *   2. pipeline: atomic SET NX submission + fastest-tap EVAL (one request)
   *   3. pipeline: persist participant record + roster + club totals (one
   *      request)
   * Scoring logic is byte-for-byte the same as before — only the transport is
   * batched.
   */
  router.post(`${prefix}/questions/submit`, async (req, res) => {
    try {
      const { token, answer, questionId } = req.body ?? {};
      const rawToken = String(token || "");
      const keys = quizKeys(mode);

      // ── Round-trip 1: everything needed to validate the submission ──
      const results = await redisPipeline([
        ["GET", keys.sessionGen],
        ["SISMEMBER", keys.kickedTokens, rawToken],
        ["HGET", keys.participantsMap, rawToken],
        ["GET", keys.state],
      ]);
      if (results === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
      const [genRaw, kicked, hashRaw, stateRaw] = Array.isArray(results) ? results : [undefined, undefined, undefined, undefined];

      const currentGen = (() => {
        const n = genRaw ? parseInt(String(genRaw), 10) : 0;
        return n > 0 ? n : 1;
      })();

      // Kicked students are rejected immediately — no further lookups needed.
      if (kicked === 1) {
        return res.status(401).json({ code: "PARTICIPANT_KICKED", error: "You were removed by the host." });
      }

      // Participant lookup: participants hash first (already in the pipeline),
      // then participant-key fallback, then pure token decoding. The happy path
      // costs zero extra Redis calls.
      let participant: any = null;
      if (hashRaw) {
        try {
          const p = typeof hashRaw === "string" ? JSON.parse(hashRaw) : hashRaw;
          if (p?.name) participant = p;
        } catch (_) {}
      }
      if (!participant) {
        const keyRaw = await redis.get<string>(keys.participantKey(rawToken));
        if (keyRaw) {
          try {
            const p = typeof keyRaw === "string" ? JSON.parse(keyRaw) : keyRaw;
            if (p?.name) participant = p;
          } catch (_) {}
        }
      }
      if (!participant) {
        const d = decodeToken(rawToken);
        if (d && d.gen === currentGen) {
          participant = {
            id: d.id,
            name: d.name,
            club: d.club,
            sessionToken: rawToken,
            gen: d.gen,
            score: 0,
            correctCount: 0,
            wrongCount: 0,
            attemptCount: 0,
            correctResponseMs: 0,
            totalResponseMs: 0,
            basePoints: 0,
            speedBonusPoints: 0,
            joinedAt: new Date().toISOString(),
          };
        }
      }

      if (!participant) {
        const d = decodeToken(rawToken);
        if (d && d.gen !== currentGen) {
          return res.status(401).json({ code: "SESSION_EXPIRED", error: "Your session was ended by the host." });
        }
        return res.status(404).json({ error: "Participant not found" });
      }
      if ((Number(participant.gen) || 0) !== currentGen) {
        return res.status(401).json({ code: "SESSION_EXPIRED", error: "Your session was ended by the host." });
      }

      // Quiz state with the same server-authoritative auto-transitions.
      let state = await materializeState(mode, parseState(stateRaw as string | null));
      if (state.status !== "LIVE") return res.status(400).json({ error: "Question is not live" });

      const currentQ = getQuestion(state.currentQuestionId, mode);
      if (!currentQ || currentQ.id !== Number(questionId)) return res.status(400).json({ error: "Wrong question" });

      const a = String(answer || "").trim().toUpperCase();
      if (!["A", "B", "C", "D"].includes(a)) return res.status(400).json({ error: "Answer must be A/B/C/D" });

      const now = Date.now();
      const startedAt = state.questionStartedAt ? new Date(state.questionStartedAt).getTime() : now;
      const { isCorrect, pointsAwarded } = evaluateSubmission(a, currentQ.correctAnswer, currentQ.points);
      const responseTimeMs = Math.max(0, now - startedAt);

      const sub: any = { id: now, participantId: participant.id, participantName: participant.name, club: participant.club, questionId: currentQ.id, questionNumber: currentQ.questionNumber, answer: a, isCorrect, pointsAwarded, responseTimeMs, submittedAt: new Date(now).toISOString(), speedRank: 0, speedBonus: 0 };

      // ── Round-trip 2: atomically save the submission (SET NX) AND compute
      // the server-authoritative fastest-finger rank in ONE Lua script. A race
      // or double-tap can never double-submit, only one answer can hold each
      // rank (1st/2nd/3rd), and a rejected duplicate can never touch the
      // ranking.
      const evalOut = await redisPipeline([
        [
          "EVAL",
          SUBMIT_LUA,
          "4",
          keys.submission(participant.id, currentQ.id),
          keys.rank(currentQ.id),
          keys.fastest(currentQ.id),
          keys.fastestLatest,
          JSON.stringify(sub),
          isCorrect
            ? JSON.stringify({
                participantId: participant.id,
                participantName: participant.name,
                club: participant.club,
                responseTimeMs,
                responseTimeSec: (responseTimeMs / 1000).toFixed(2),
                submittedAt: sub.submittedAt,
                questionNumber: currentQ.questionNumber,
                answer: a,
              })
            : "",
        ],
      ]);
      if (evalOut === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
      const status2 = Array.isArray(evalOut) ? evalOut[0] : evalOut;
      if (status2 === "DUPLICATE") return res.status(400).json({ error: "Already submitted" });
      let speedRank = 0;
      let speedBonus = 0;
      if (typeof status2 === "string" && status2.startsWith("{")) {
        try {
          const ranked = JSON.parse(status2);
          if (ranked?.status === "OK") {
            speedRank = Number(ranked.rank) || 0;
            speedBonus = Number(ranked.speedBonus) || 0;
          }
        } catch (_) {}
      }
      if (rankedStatusInvalid(status2)) {
        // The store accepted the submission but returned an unexpected status —
        // fail closed rather than risk double-scoring.
        return res.status(400).json({ error: "Submission failed" });
      }

      // earnedPoints = basePoints (question.points) + speedBonus. Wrong answers
      // earn 0 and never receive a speed bonus (speedRank stays 0).
      const earnedPoints = pointsAwarded + speedBonus;
      sub.speedRank = speedRank;
      sub.speedBonus = speedBonus;

      participant.score = (participant.score || 0) + earnedPoints;
      participant.basePoints = (participant.basePoints || 0) + pointsAwarded;
      participant.speedBonusPoints = (participant.speedBonusPoints || 0) + speedBonus;
      participant.correctCount = (participant.correctCount || 0) + (isCorrect ? 1 : 0);
      participant.wrongCount = (participant.wrongCount || 0) + (isCorrect ? 0 : 1);
      participant.attemptCount = (participant.attemptCount || 0) + 1;
      // Team tie-break uses BOTH correctness and speed: accumulate the total
      // response time on CORRECT answers so equal teams/students are ranked by
      // who answered correctly fastest.
      if (isCorrect) {
        participant.correctResponseMs = (participant.correctResponseMs || 0) + responseTimeMs;
      }
      // Total timing across EVERY submitted answer (correct or not) — powers
      // the final results table's "total time by answer submitted".
      participant.totalResponseMs = (participant.totalResponseMs || 0) + responseTimeMs;

      // Track the current-question submission on the participant record so the
      // student session poll (hasSubmitted / userSubmission) needs no extra
      // Redis round-trip.
      participant.lastQuestionId = currentQ.id;
      participant.lastAnswer = a;
      participant.lastSubmittedAt = sub.submittedAt;

      // ── Round-trip 3: persist participant + roster + club totals in one
      // pipelined request. The club score is the sum of every participant's
      // earned points (base + speed bonus) — never double-counted. The stored
      // submission is re-written with the final speed rank/bonus (the atomic
      // EVAL saved it before the rank was known) so the admin question
      // breakdown and result feeds see the exact rank that was awarded.
      const clubGain = earnedPoints;
      const cmds3: (string | number)[][] = [
        ["SET", keys.participantKey(participant.sessionToken), JSON.stringify(participant), "EX", 86400],
        ["HSET", keys.participantsMap, participant.sessionToken, JSON.stringify(participant)],
        ["SADD", keys.participantTokens, participant.sessionToken],
        ["SET", keys.submission(participant.id, currentQ.id), JSON.stringify(sub)],
      ];
      if (clubGain > 0) {
        cmds3.push(["INCRBY", keys.clubScore(participant.club), clubGain]);
      }
      await redisPipeline(cmds3);

      // Realtime: notify admin/display clients a submission landed (no
      // correctness/points — those stay hidden until reveal) and push the
      // updated club scores so leaderboards move instantly. The speed rank is
      // included so the admin live feed can show ⚡ FASTEST +3 immediately.
      emitRealtime(mode, "participant:submitted", {
        participantId: participant.id,
        participantName: participant.name,
        club: participant.club,
        answer: a,
        questionNumber: currentQ.questionNumber,
        responseTimeMs,
        speedRank,
        speedBonus,
      });
      await publishClubScores(mode);

      res.json({
        ok: true,
        submission: sanitizeSubmission(sub),
        participantScore: participant.score,
        basePoints: participant.basePoints || 0,
        speedBonusPoints: participant.speedBonusPoints || 0,
        speedRank,
        speedBonus,
        earnedPoints,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Submission failed" });
    }
  });
}

// Dual-mount — register the live quiz (no prefix) and the test quiz (/test)
registerModeRoutes(r, "", "live");
registerModeRoutes(r, "/test", "test");

// Serve the built client (client → dist/) from the same origin when present.
// Powers the single-URL event setup (LAN or free public tunnel): one process
// serves both the frontend and the API, and the production client already
// calls the API relative to its own origin. Skipped on Vercel, where the
// platform serves the static build and rewrites non-API routes to index.html.
if (process.env.VERCEL !== "1") {
  const DIST_DIR = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    app.use(express.static(DIST_DIR));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
  }
}

app.use("/api", r);
app.use("/", r);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API Error:", err);
  // Fail closed when the authoritative state store is unreachable: never
  // fabricate a WAITING (or any other) quiz state from a Redis outage.
  if (err?.name === "RedisUnavailableError") {
    return res.status(503).json({
      error: "Quiz state temporarily unavailable — state store unreachable",
      code: "STATE_UNAVAILABLE",
    });
  }
  // Same fail-closed stance, but for the distinct billing condition where the
  // store is reachable yet rejects every command: Upstash free-tier request
  // quota exhausted (500k commands/month). The remedy is outside the code.
  if (err?.name === "RedisQuotaExceededError") {
    return res.status(503).json({
      error:
        "Quiz temporarily unavailable — Upstash Redis request quota exhausted (free-tier 500k/month limit reached). Add a payment method to auto-upgrade the database, or create a new database and update UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.",
      code: "REDIS_QUOTA_EXCEEDED",
    });
  }
  res.status(500).json({ error: err?.message || "Internal server error" });
});

export { app };
export default app;
