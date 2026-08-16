/**
 * QuizBattle API — Upstash Redis-backed Vercel Serverless Handler
 * Uses @upstash/redis SDK for shared state across all serverless lambdas.
 */

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData.js";
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
  {
    "id": 1,
    "name": "Computer & IT Basics",
    "pointValue": 1
  },
  {
    "id": 2,
    "name": "Internet, Web & Digital World",
    "pointValue": 1
  },
  {
    "id": 3,
    "name": "Programming & Logic",
    "pointValue": 2
  },
  {
    "id": 4,
    "name": "Cybersecurity, AI & Modern IT",
    "pointValue": 2
  },
  {
    "id": 5,
    "name": "The Hackathon Challenge",
    "pointValue": 3
  }
];

export const QUESTIONS: QuestionItem[] = [
  {
    "id": 1,
    "questionNumber": 1,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "What does CPU stand for?",
    "optionA": "Central Processing Unit",
    "optionB": "Computer Personal Unit",
    "optionC": "Central Program Utility",
    "optionD": "Computer Processing User",
    "correctAnswer": "A"
  },
  {
    "id": 2,
    "questionNumber": 2,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which device is mainly used to display output?",
    "optionA": "Keyboard",
    "optionB": "Mouse",
    "optionC": "Monitor",
    "optionD": "Scanner",
    "correctAnswer": "C"
  },
  {
    "id": 3,
    "questionNumber": 3,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which of these is an input device?",
    "optionA": "Monitor",
    "optionB": "Printer",
    "optionC": "Keyboard",
    "optionD": "Speaker",
    "correctAnswer": "C"
  },
  {
    "id": 4,
    "questionNumber": 4,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which device is used to move the pointer on a computer?",
    "optionA": "Mouse",
    "optionB": "Printer",
    "optionC": "Speaker",
    "optionD": "Projector ---PAGE---",
    "correctAnswer": "A"
  },
  {
    "id": 5,
    "questionNumber": 5,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which of the following is an operating system?",
    "optionA": "Google",
    "optionB": "Windows",
    "optionC": "YouTube",
    "optionD": "Intel",
    "correctAnswer": "B"
  },
  {
    "id": 6,
    "questionNumber": 6,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "What is the full form of RAM?",
    "optionA": "Random Access Memory",
    "optionB": "Read Access Memory",
    "optionC": "Rapid Access Machine",
    "optionD": "Random Application Memory",
    "correctAnswer": "A"
  },
  {
    "id": 7,
    "questionNumber": 7,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which one stores data permanently?",
    "optionA": "RAM",
    "optionB": "Cache",
    "optionC": "SSD",
    "optionD": "Register",
    "correctAnswer": "C"
  },
  {
    "id": 8,
    "questionNumber": 8,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "What is the brain of a computer commonly called?",
    "optionA": "RAM",
    "optionB": "CPU",
    "optionC": "Hard Disk",
    "optionD": "Monitor",
    "correctAnswer": "B"
  },
  {
    "id": 9,
    "questionNumber": 9,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which key is commonly used to delete characters to the left of the cursor? ---PAGE---",
    "optionA": "Shift",
    "optionB": "Ctrl",
    "optionC": "Backspace",
    "optionD": "Alt",
    "correctAnswer": "C"
  },
  {
    "id": 10,
    "questionNumber": 10,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which shortcut is commonly used to copy selected text?",
    "optionA": "Ctrl + X",
    "optionB": "Ctrl + C",
    "optionC": "Ctrl + V",
    "optionD": "Ctrl + Z",
    "correctAnswer": "B"
  },
  {
    "id": 11,
    "questionNumber": 11,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which shortcut is commonly used to paste?",
    "optionA": "Ctrl + P",
    "optionB": "Ctrl + V",
    "optionC": "Ctrl + S",
    "optionD": "Ctrl + A",
    "correctAnswer": "B"
  },
  {
    "id": 12,
    "questionNumber": 12,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which shortcut is used to save a file?",
    "optionA": "Ctrl + S",
    "optionB": "Ctrl + F",
    "optionC": "Ctrl + D",
    "optionD": "Ctrl + W",
    "correctAnswer": "A"
  },
  {
    "id": 13,
    "questionNumber": 13,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which of these is a web browser?",
    "optionA": "Chrome",
    "optionB": "Windows",
    "optionC": "Linux",
    "optionD": "Android ---PAGE---",
    "correctAnswer": "A"
  },
  {
    "id": 14,
    "questionNumber": 14,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which company develops the Windows operating system?",
    "optionA": "Apple",
    "optionB": "Microsoft",
    "optionC": "Google",
    "optionD": "IBM",
    "correctAnswer": "B"
  },
  {
    "id": 15,
    "questionNumber": 15,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "What is used to print documents on paper?",
    "optionA": "Scanner",
    "optionB": "Monitor",
    "optionC": "Printer",
    "optionD": "Router",
    "correctAnswer": "C"
  },
  {
    "id": 16,
    "questionNumber": 16,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which of these is a search engine?",
    "optionA": "Google",
    "optionB": "Windows",
    "optionC": "Linux",
    "optionD": "Python",
    "correctAnswer": "A"
  },
  {
    "id": 17,
    "questionNumber": 17,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "What is a file extension commonly associated with a Microsoft Word document?",
    "optionA": ".mp3",
    "optionB": ".jpg",
    "optionC": ".docx",
    "optionD": ".exe",
    "correctAnswer": "C"
  },
  {
    "id": 18,
    "questionNumber": 18,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which of these is used to store pictures?",
    "optionA": ".jpg",
    "optionB": ".mp3",
    "optionC": ".exe",
    "optionD": ".txt",
    "correctAnswer": "A"
  },
  {
    "id": 19,
    "questionNumber": 19,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "1 KB is approximately equal to:",
    "optionA": "100 bytes",
    "optionB": "1024 bytes",
    "optionC": "1000 MB",
    "optionD": "8 bytes",
    "correctAnswer": "B"
  },
  {
    "id": 20,
    "questionNumber": 20,
    "roundId": 1,
    "roundName": "Computer & IT Basics",
    "points": 1,
    "questionText": "Which device connects a computer to a network wirelessly?",
    "optionA": "Wi-Fi adapter",
    "optionB": "Printer",
    "optionC": "Keyboard",
    "optionD": "Webcam",
    "correctAnswer": "A"
  },
  {
    "id": 21,
    "questionNumber": 21,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does WWW stand for?",
    "optionA": "World Wide Web",
    "optionB": "World Web Window",
    "optionC": "Wide World Wire",
    "optionD": "Web World Wide",
    "correctAnswer": "A"
  },
  {
    "id": 22,
    "questionNumber": 22,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does URL stand for?",
    "optionA": "Uniform Resource Locator",
    "optionB": "Universal Reference Link",
    "optionC": "Uniform Research Link",
    "optionD": "User Resource Location",
    "correctAnswer": "A"
  },
  {
    "id": 23,
    "questionNumber": 23,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which symbol is normally present in an email address?",
    "optionA": "#",
    "optionB": "@",
    "optionC": "&",
    "optionD": "%",
    "correctAnswer": "B"
  },
  {
    "id": 24,
    "questionNumber": 24,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which protocol is commonly used for secure websites? ---PAGE---",
    "optionA": "HTTP",
    "optionB": "HTTPS",
    "optionC": "FTP",
    "optionD": "SMTP",
    "correctAnswer": "B"
  },
  {
    "id": 25,
    "questionNumber": 25,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does \"Wi-Fi\" allow devices to do?",
    "optionA": "Connect to a network wirelessly",
    "optionB": "Increase RAM",
    "optionC": "Print documents",
    "optionD": "Charge batteries",
    "correctAnswer": "A"
  },
  {
    "id": 26,
    "questionNumber": 26,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which device commonly provides internet access to multiple devices at home?",
    "optionA": "Router",
    "optionB": "Monitor",
    "optionC": "Keyboard",
    "optionD": "Scanner",
    "correctAnswer": "A"
  },
  {
    "id": 27,
    "questionNumber": 27,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What is a website?",
    "optionA": "A collection of web pages",
    "optionB": "A computer processor",
    "optionC": "A keyboard layout",
    "optionD": "A type of RAM",
    "correctAnswer": "A"
  },
  {
    "id": 28,
    "questionNumber": 28,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which language is mainly used to structure web pages? ---PAGE---",
    "optionA": "HTML",
    "optionB": "SQL",
    "optionC": "Python",
    "optionD": "C++",
    "correctAnswer": "A"
  },
  {
    "id": 29,
    "questionNumber": 29,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which language is commonly used to style web pages?",
    "optionA": "HTML",
    "optionB": "CSS",
    "optionC": "SQL",
    "optionD": "Java",
    "correctAnswer": "B"
  },
  {
    "id": 30,
    "questionNumber": 30,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which language is commonly used to add interactivity to web pages?",
    "optionA": "JavaScript",
    "optionB": "HTML",
    "optionC": "SQL",
    "optionD": "XML",
    "correctAnswer": "A"
  },
  {
    "id": 31,
    "questionNumber": 31,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does HTTP 404 usually mean?",
    "optionA": "Website is secure",
    "optionB": "Page not found",
    "optionC": "Server is working perfectly",
    "optionD": "Login successful",
    "correctAnswer": "B"
  },
  {
    "id": 32,
    "questionNumber": 32,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does downloading mean? ---PAGE---",
    "optionA": "Sending data from your device to the internet",
    "optionB": "Receiving data from the internet",
    "optionC": "Deleting data",
    "optionD": "Encrypting data",
    "correctAnswer": "B"
  },
  {
    "id": 33,
    "questionNumber": 33,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does uploading mean?",
    "optionA": "Sending data from your device to another system/server",
    "optionB": "Deleting a file",
    "optionC": "Opening a browser",
    "optionD": "Restarting a computer",
    "correctAnswer": "A"
  },
  {
    "id": 34,
    "questionNumber": 34,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which is an example of cloud storage?",
    "optionA": "Google Drive",
    "optionB": "Keyboard",
    "optionC": "RAM",
    "optionD": "BIOS",
    "correctAnswer": "A"
  },
  {
    "id": 35,
    "questionNumber": 35,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What is a CAPTCHA generally used for?",
    "optionA": "Increase screen brightness",
    "optionB": "Distinguish humans from automated bots",
    "optionC": "Compress files",
    "optionD": "Play videos",
    "correctAnswer": "B"
  },
  {
    "id": 36,
    "questionNumber": 36,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What is a domain name? ---PAGE---",
    "optionA": "A human-readable website address",
    "optionB": "A computer's RAM",
    "optionC": "A password",
    "optionD": "A file type",
    "correctAnswer": "A"
  },
  {
    "id": 37,
    "questionNumber": 37,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which one is a valid domain?",
    "optionA": "google.com",
    "optionB": "google@",
    "optionC": "google#",
    "optionD": "google.exe",
    "correctAnswer": "A"
  },
  {
    "id": 38,
    "questionNumber": 38,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What is a browser mainly used for?",
    "optionA": "Browsing websites",
    "optionB": "Editing hardware",
    "optionC": "Increasing storage",
    "optionD": "Charging a laptop",
    "correctAnswer": "A"
  },
  {
    "id": 39,
    "questionNumber": 39,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "Which application is commonly used for video meetings?",
    "optionA": "Zoom",
    "optionB": "Notepad",
    "optionC": "Paint",
    "optionD": "Calculator",
    "correctAnswer": "A"
  },
  {
    "id": 40,
    "questionNumber": 40,
    "roundId": 2,
    "roundName": "Internet, Web & Digital World",
    "points": 1,
    "questionText": "What does \"online\" generally mean? ---PAGE---",
    "optionA": "Connected to a network or internet",
    "optionB": "Computer turned off",
    "optionC": "No storage available",
    "optionD": "Printer disconnected",
    "correctAnswer": "A"
  },
  {
    "id": 41,
    "questionNumber": 41,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is a program?",
    "optionA": "A set of instructions for a computer",
    "optionB": "A computer screen",
    "optionC": "A storage device",
    "optionD": "A network cable",
    "correctAnswer": "A"
  },
  {
    "id": 42,
    "questionNumber": 42,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which of these is a programming language?",
    "optionA": "Python",
    "optionB": "Chrome ---PAGE---",
    "optionC": "Windows",
    "optionD": "Google",
    "correctAnswer": "A"
  },
  {
    "id": 43,
    "questionNumber": 43,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is a variable?",
    "optionA": "A place to store a value in a program",
    "optionB": "A computer cable",
    "optionC": "A web browser",
    "optionD": "A hardware device",
    "correctAnswer": "A"
  },
  {
    "id": 44,
    "questionNumber": 44,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which value is an integer?",
    "optionA": "\"Hello\"",
    "optionB": "25",
    "optionC": "25.5",
    "optionD": "True",
    "correctAnswer": "B"
  },
  {
    "id": 45,
    "questionNumber": 45,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which value is a string?",
    "optionA": "100",
    "optionB": "3.14",
    "optionC": "\"Hello\"",
    "optionD": "True ---PAGE---",
    "correctAnswer": "C"
  },
  {
    "id": 46,
    "questionNumber": 46,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What does an if statement generally do?",
    "optionA": "Makes a decision based on a condition",
    "optionB": "Stores a file",
    "optionC": "Connects to Wi-Fi",
    "optionD": "Prints a document",
    "correctAnswer": "A"
  },
  {
    "id": 47,
    "questionNumber": 47,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is a loop used for?",
    "optionA": "Repeating instructions",
    "optionB": "Connecting to the internet",
    "optionC": "Storing pictures",
    "optionD": "Turning off the computer",
    "correctAnswer": "A"
  },
  {
    "id": 48,
    "questionNumber": 48,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is a function?",
    "optionA": "A reusable block of code",
    "optionB": "A type of monitor",
    "optionC": "A storage device",
    "optionD": "A network protocol",
    "correctAnswer": "A"
  },
  {
    "id": 49,
    "questionNumber": 49,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is an algorithm?",
    "optionA": "A step-by-step method to solve a problem",
    "optionB": "A programming keyboard",
    "optionC": "A type of virus",
    "optionD": "An operating system",
    "correctAnswer": "A"
  },
  {
    "id": 50,
    "questionNumber": 50,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What will 2 + 3 produce in most programming languages?",
    "optionA": "5",
    "optionB": "6",
    "optionC": "23",
    "optionD": "1",
    "correctAnswer": "A"
  },
  {
    "id": 51,
    "questionNumber": 51,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is the result of 10 > 5?",
    "optionA": "False",
    "optionB": "True",
    "optionC": "0",
    "optionD": "Error",
    "correctAnswer": "B"
  },
  {
    "id": 52,
    "questionNumber": 52,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which symbol is commonly used for multiplication?",
    "optionA": "x",
    "optionB": "*",
    "optionC": "#",
    "optionD": "%",
    "correctAnswer": "B"
  },
  {
    "id": 53,
    "questionNumber": 53,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which of these is used to represent \"not equal\" in many languages?",
    "optionA": "=",
    "optionB": "==",
    "optionC": "!=",
    "optionD": "=>",
    "correctAnswer": "C"
  },
  {
    "id": 54,
    "questionNumber": 54,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is debugging?",
    "optionA": "Finding and fixing errors in code",
    "optionB": "Writing an email",
    "optionC": "Installing RAM",
    "optionD": "Creating a password",
    "correctAnswer": "A"
  },
  {
    "id": 55,
    "questionNumber": 55,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is an error in a program?",
    "optionA": "A problem that prevents the program from behaving correctly",
    "optionB": "A type of computer monitor",
    "optionC": "A web browser",
    "optionD": "A storage method",
    "correctAnswer": "A"
  },
  {
    "id": 56,
    "questionNumber": 56,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which language is known for being beginner-friendly?",
    "optionA": "Python",
    "optionB": "Machine code only",
    "optionC": "Assembly only",
    "optionD": "Binary only",
    "correctAnswer": "A"
  },
  {
    "id": 57,
    "questionNumber": 57,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What does print() commonly do in Python?",
    "optionA": "Displays output",
    "optionB": "Deletes a file",
    "optionC": "Opens Wi-Fi",
    "optionD": "Shuts down the system",
    "correctAnswer": "A"
  },
  {
    "id": 58,
    "questionNumber": 58,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "What is an array?",
    "optionA": "A collection of values",
    "optionB": "A monitor",
    "optionC": "A network cable",
    "optionD": "An operating system",
    "correctAnswer": "A"
  },
  {
    "id": 59,
    "questionNumber": 59,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "Which data type represents True/False?",
    "optionA": "Integer",
    "optionB": "String",
    "optionC": "Boolean",
    "optionD": "Float",
    "correctAnswer": "C"
  },
  {
    "id": 60,
    "questionNumber": 60,
    "roundId": 3,
    "roundName": "Programming & Logic",
    "points": 2,
    "questionText": "If a program asks for your name and you enter \"Sagar\", what type of data is it?",
    "optionA": "Integer",
    "optionB": "String",
    "optionC": "Boolean",
    "optionD": "Float",
    "correctAnswer": "B"
  },
  {
    "id": 61,
    "questionNumber": 61,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is cybersecurity?",
    "optionA": "Protecting systems and data from digital attacks",
    "optionB": "Making websites colorful",
    "optionC": "Increasing CPU speed",
    "optionD": "Installing games",
    "correctAnswer": "A"
  },
  {
    "id": 62,
    "questionNumber": 62,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is a strong password?",
    "optionA": "123456",
    "optionB": "password",
    "optionC": "A long, unique password",
    "optionD": "Your first name",
    "correctAnswer": "C"
  },
  {
    "id": 63,
    "questionNumber": 63,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is phishing?",
    "optionA": "A method of tricking people into revealing sensitive information",
    "optionB": "A programming language",
    "optionC": "A database system",
    "optionD": "A type of monitor ---PAGE---",
    "correctAnswer": "A"
  },
  {
    "id": 64,
    "questionNumber": 64,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "Which is the safest action when you receive a suspicious email link?",
    "optionA": "Click immediately",
    "optionB": "Share it with friends",
    "optionC": "Verify the sender and link before opening",
    "optionD": "Enter your password",
    "correctAnswer": "C"
  },
  {
    "id": 65,
    "questionNumber": 65,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is malware?",
    "optionA": "Malicious software",
    "optionB": "A programming framework",
    "optionC": "A web browser",
    "optionD": "A database",
    "correctAnswer": "A"
  },
  {
    "id": 66,
    "questionNumber": 66,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is a computer virus?",
    "optionA": "A type of malicious program",
    "optionB": "A hardware component",
    "optionC": "A web server",
    "optionD": "An operating system",
    "correctAnswer": "A"
  },
  {
    "id": 67,
    "questionNumber": 67,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What does antivirus software do?",
    "optionA": "Helps detect and remove malicious software",
    "optionB": "Increases monitor size ---PAGE---",
    "optionC": "Creates websites",
    "optionD": "Increases internet speed",
    "correctAnswer": "A"
  },
  {
    "id": 68,
    "questionNumber": 68,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What does 2FA stand for?",
    "optionA": "Two-Factor Authentication",
    "optionB": "Two File Access",
    "optionC": "Two Format Application",
    "optionD": "Two Function Algorithm",
    "correctAnswer": "A"
  },
  {
    "id": 69,
    "questionNumber": 69,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "Why is HTTPS safer than HTTP?",
    "optionA": "It encrypts communication between the browser and website",
    "optionB": "It makes the computer faster",
    "optionC": "It increases RAM",
    "optionD": "It blocks every virus",
    "correctAnswer": "A"
  },
  {
    "id": 70,
    "questionNumber": 70,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is encryption?",
    "optionA": "Converting data into a protected encoded form",
    "optionB": "Deleting data",
    "optionC": "Copying data",
    "optionD": "Printing data",
    "correctAnswer": "A"
  },
  {
    "id": 71,
    "questionNumber": 71,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is artificial intelligence?",
    "optionA": "Technology that enables computers to perform tasks associated with human intelligence ---PAGE---",
    "optionB": "A type of keyboard",
    "optionC": "A storage device",
    "optionD": "A network cable",
    "correctAnswer": "A"
  },
  {
    "id": 72,
    "questionNumber": 72,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "Which is an example of generative AI?",
    "optionA": "A system that generates text or images from prompts",
    "optionB": "A keyboard",
    "optionC": "A printer",
    "optionD": "A calculator",
    "correctAnswer": "A"
  },
  {
    "id": 73,
    "questionNumber": 73,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is machine learning?",
    "optionA": "A method where computers learn patterns from data",
    "optionB": "A method of cleaning hardware",
    "optionC": "A type of monitor",
    "optionD": "A file format",
    "correctAnswer": "A"
  },
  {
    "id": 74,
    "questionNumber": 74,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is a chatbot?",
    "optionA": "Software designed to communicate with users",
    "optionB": "A computer virus",
    "optionC": "A network cable",
    "optionD": "A type of CPU",
    "correctAnswer": "A"
  },
  {
    "id": 75,
    "questionNumber": 75,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "Which of the following is an example of biometric authentication?",
    "optionA": "Fingerprint",
    "optionB": "Username",
    "optionC": "Password",
    "optionD": "PIN",
    "correctAnswer": "A"
  },
  {
    "id": 76,
    "questionNumber": 76,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is a firewall?",
    "optionA": "A system that controls network traffic",
    "optionB": "A physical wall around a computer",
    "optionC": "A programming language",
    "optionD": "A database",
    "correctAnswer": "A"
  },
  {
    "id": 77,
    "questionNumber": 77,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is personal data?",
    "optionA": "Information that can relate to an individual",
    "optionB": "Only computer hardware",
    "optionC": "Only public websites",
    "optionD": "Only programming code",
    "correctAnswer": "A"
  },
  {
    "id": 78,
    "questionNumber": 78,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "Which is safer on a public computer?",
    "optionA": "Saving your password permanently",
    "optionB": "Logging out after use",
    "optionC": "Sharing your password",
    "optionD": "Disabling security",
    "correctAnswer": "B"
  },
  {
    "id": 79,
    "questionNumber": 79,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What should you do before installing an unknown application?",
    "optionA": "Install immediately",
    "optionB": "Check its source and legitimacy",
    "optionC": "Disable antivirus",
    "optionD": "Share your password",
    "correctAnswer": "B"
  },
  {
    "id": 80,
    "questionNumber": 80,
    "roundId": 4,
    "roundName": "Cybersecurity, AI & Modern IT",
    "points": 2,
    "questionText": "What is cloud computing?",
    "optionA": "Using computing resources over the internet",
    "optionB": "Storing data only on paper",
    "optionC": "Repairing computers",
    "optionD": "Connecting a keyboard",
    "correctAnswer": "A"
  },
  {
    "id": 81,
    "questionNumber": 81,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "A program receives the number 5 and prints 25. What is it most likely doing?",
    "optionA": "Adding 20",
    "optionB": "Multiplying the number by itself",
    "optionC": "Subtracting 20",
    "optionD": "Dividing by 5",
    "correctAnswer": "B"
  },
  {
    "id": 82,
    "questionNumber": 82,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "What is the output of this logic? x = 10 if x > 5: print(\"Yes\")",
    "optionA": "No",
    "optionB": "Yes",
    "optionC": "10",
    "optionD": "Error",
    "correctAnswer": "B"
  },
  {
    "id": 83,
    "questionNumber": 83,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which comes first when visiting a website?",
    "optionA": "Browser sends a request",
    "optionB": "Printer prints the website",
    "optionC": "Keyboard creates the website",
    "optionD": "Monitor sends the request",
    "correctAnswer": "A"
  },
  {
    "id": 84,
    "questionNumber": 84,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "If a website is working on your friend's phone but not on yours, which is the most sensible first step?",
    "optionA": "Destroy the router",
    "optionB": "Check your internet connection ---PAGE---",
    "optionC": "Delete the website",
    "optionD": "Format the phone",
    "correctAnswer": "B"
  },
  {
    "id": 85,
    "questionNumber": 85,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "You need to store 100 student names in a program. Which is most suitable?",
    "optionA": "A single number",
    "optionB": "An array/list",
    "optionC": "A Boolean",
    "optionD": "A single character",
    "correctAnswer": "B"
  },
  {
    "id": 86,
    "questionNumber": 86,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which database operation is used to retrieve information?",
    "optionA": "SELECT",
    "optionB": "DELETE",
    "optionC": "INSERT",
    "optionD": "DROP",
    "correctAnswer": "A"
  },
  {
    "id": 87,
    "questionNumber": 87,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which SQL command adds a new record?",
    "optionA": "SELECT",
    "optionB": "INSERT",
    "optionC": "UPDATE",
    "optionD": "DELETE",
    "correctAnswer": "B"
  },
  {
    "id": 88,
    "questionNumber": 88,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which SQL command changes existing data?",
    "optionA": "CREATE",
    "optionB": "UPDATE ---PAGE---",
    "optionC": "SELECT",
    "optionD": "INSERT",
    "correctAnswer": "B"
  },
  {
    "id": 89,
    "questionNumber": 89,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which data structure follows FIFO?",
    "optionA": "Stack",
    "optionB": "Queue",
    "optionC": "Tree",
    "optionD": "Graph",
    "correctAnswer": "B"
  },
  {
    "id": 90,
    "questionNumber": 90,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which data structure follows LIFO?",
    "optionA": "Queue",
    "optionB": "Stack",
    "optionC": "Array",
    "optionD": "Tree",
    "correctAnswer": "B"
  },
  {
    "id": 91,
    "questionNumber": 91,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "If you want to find the shortest path between two locations on a map, which concept is useful?",
    "optionA": "Graph algorithms",
    "optionB": "Word processing",
    "optionC": "Image compression only",
    "optionD": "Keyboard shortcuts",
    "correctAnswer": "A"
  },
  {
    "id": 92,
    "questionNumber": 92,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which HTTP method is normally used to retrieve information from a server? ---PAGE---",
    "optionA": "GET",
    "optionB": "POST",
    "optionC": "DELETE",
    "optionD": "PATCH",
    "correctAnswer": "A"
  },
  {
    "id": 93,
    "questionNumber": 93,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which HTTP status code normally means \"OK\"?",
    "optionA": "200",
    "optionB": "404",
    "optionC": "500",
    "optionD": "301",
    "correctAnswer": "A"
  },
  {
    "id": 94,
    "questionNumber": 94,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which HTTP status code means \"Not Found\"?",
    "optionA": "200",
    "optionB": "301",
    "optionC": "404",
    "optionD": "500",
    "correctAnswer": "C"
  },
  {
    "id": 95,
    "questionNumber": 95,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "A website asks for a student's name, email and password. Which should NOT be stored as plain text?",
    "optionA": "Password",
    "optionB": "Student name",
    "optionC": "City",
    "optionD": "Course name",
    "correctAnswer": "A"
  },
  {
    "id": 96,
    "questionNumber": 96,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Which version-control tool is widely used by developers? ---PAGE---",
    "optionA": "Git",
    "optionB": "Paint",
    "optionC": "Calculator",
    "optionD": "Notepad",
    "correctAnswer": "A"
  },
  {
    "id": 97,
    "questionNumber": 97,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "What is the main purpose of Git?",
    "optionA": "Track changes in code",
    "optionB": "Increase internet speed",
    "optionC": "Edit photos",
    "optionD": "Scan documents",
    "correctAnswer": "A"
  },
  {
    "id": 98,
    "questionNumber": 98,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Two programmers modify the same part of a file using Git. What may happen?",
    "optionA": "Merge conflict",
    "optionB": "Computer explodes",
    "optionC": "Internet disappears",
    "optionD": "RAM doubles",
    "correctAnswer": "A"
  },
  {
    "id": 99,
    "questionNumber": 99,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "Your team has 24 hours to build a project. Which approach is generally best?",
    "optionA": "Build every possible feature",
    "optionB": "Build a small working core feature first",
    "optionC": "Spend 20 hours choosing colors",
    "optionD": "Start coding without understanding the problem",
    "correctAnswer": "B"
  },
  {
    "id": 100,
    "questionNumber": 100,
    "roundId": 5,
    "roundName": "The Hackathon Challenge",
    "points": 3,
    "questionText": "What is the most important goal of a hackathon project?",
    "optionA": "Having the most complicated code",
    "optionB": "Solving a real problem with a useful working solution",
    "optionC": "Using as many programming languages as possible",
    "optionD": "Making the project name complicated",
    "correctAnswer": "B"
  }
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

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "https://casual-ray-186045.upstash.io")
  .replace(/^["']|["']$/g, "")
  .trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAAta9AAIgcDI3NmExNGJjOTA2YTU0MDk4YTc5OGUzMWYyMjI4N2U5Yg")
  .replace(/^["']|["']$/g, "")
  .trim();

// Sentinel returned by redisCommand when the Redis store is unreachable.
// It is deliberately distinct from `null` (which Redis itself returns for a
// missing key), so callers can fail closed instead of mistaking an outage
// for an empty store. `undefined` can never be a real Redis result (JSON has
// no undefined).
const REDIS_UNAVAILABLE = undefined;

async function redisCommand(cmd: (string | number)[]) {
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) return REDIS_UNAVAILABLE;
    const data = (await res.json()) as { result?: any; error?: string };
    if (data && typeof data === "object" && "error" in data) return REDIS_UNAVAILABLE;
    return data.result;
  } catch (err) {
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
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) return REDIS_UNAVAILABLE;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return REDIS_UNAVAILABLE;
    return data.map((item: any) => {
      if (item && typeof item === "object" && "result" in item) return item.result;
      return REDIS_UNAVAILABLE;
    });
  } catch (err) {
    console.error("Redis pipeline error:", err);
    return REDIS_UNAVAILABLE;
  }
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
 * Maximum number of students allowed to join the TEST portal (practice mode).
 * The live event portal is unlimited — this cap applies to test mode only and
 * is enforced at registration time (PORTAL_FULL).
 */
const TEST_MODE_MAX_MEMBERS = 60;

/**
 * Bonus points awarded whenever a participant answers 3 questions correctly
 * AND fastest in a row (contiguous fastest-correct streak). Awarded again at
 * every multiple of 3 (6, 9, ...) while the streak is unbroken.
 */
const FASTEST_STREAK_BONUS = 5;

/**
 * Per-question answer window (server-authoritative), scaled by difficulty and
 * quiz mode:
 *
 * LIVE quiz (100 questions):
 *   Q1–40    → 15s (easy warm-up rounds)
 *   Q41–80   → 30s (core rounds)
 *   Q81–100  → 45s (hackathon challenge finale)
 *
 * TEST quiz (60 questions):
 *   Q1–20    → 15s (ROUND 1 — EASY BASICS)
 *   Q21–40   → 30s (ROUND 2 — MID-LEVEL IT)
 *   Q41–60   → 45s (ROUND 3 — LOGIC BUILDING)
 *
 * Unknown/future question numbers fall back to the default 30s.
 */
function questionDurationSeconds(questionNumber: number | null | undefined, mode: QuizMode = "live"): number {
  const n = Number(questionNumber) || 0;
  if (mode === "test") {
    if (n >= 1 && n <= 20) return 15;
    if (n >= 21 && n <= 40) return 30;
    if (n >= 41) return 45;
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
    participantKey: (token: string) => (isTest ? `pt:${token}` : `p:${token}`),
    submission: (pid: number, qid: number) => (isTest ? `sub:test:${pid}:${qid}` : `sub:${pid}:${qid}`),
    clubScore: (club: string) => (isTest ? `score:test:${club}` : `score:${club}`),
    fastest: (qid: number) => (isTest ? `fastest:test:${qid}` : `fastest:${qid}`),
    fastestLatest: isTest ? "fastest:test:latest" : "fastest:latest",
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
 * Server-authoritative auto-transitions applied on every state read:
 * COUNTDOWN (5s) -> LIVE (30s) once countdownEndsAt passes, and LIVE -> LOCKED
 * once questionEndsAt passes. Mutates and returns the given state.
 */
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

  // 2. Auto-transition LIVE -> LOCKED
  if (state.status === "LIVE" && state.questionEndsAt) {
    if (new Date(state.questionEndsAt).getTime() <= Date.now()) {
      state.status = "LOCKED";
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
  const parsed = parseState(raw);
  if (!parsed) return { ...DEFAULT_STATE };
  const before = JSON.stringify(parsed);
  const next = applyAutoTransitions(parsed, mode);
  // Only persist when a transition actually happened.
  if (JSON.stringify(next) !== before) {
    await redis.set(quizKeys(mode).state, JSON.stringify(next));
  }
  return next;
}

async function setState(mode: QuizMode, patch: Partial<QuizSessionState>): Promise<QuizSessionState> {
  const current = await getState(mode);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await redis.set(quizKeys(mode).state, JSON.stringify(next));
  return next;
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
      fastestStreak: 0,
      bonusPoints: 0,
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
}

/**
 * Number of currently registered participants in a mode. The participantTokens
 * set is the canonical roster: it is SADDed on register, SREM'd on kick, and
 * deleted on a fresh wipe, so SCARD is an accurate live count.
 */
async function countRegisteredParticipants(mode: QuizMode): Promise<number> {
  const res = await redisCommand(["SCARD", quizKeys(mode).participantTokens]);
  return typeof res === "number" ? res : 0;
}

async function getSubmission(pid: number, qid: number, mode: QuizMode = "live") {
  const raw = await redis.get<string>(quizKeys(mode).submission(pid, qid));
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

// Atomically record a submission only if the participant has not already
// submitted for this question. SET ... NX is atomic on Redis, so two (or a
// hundred) simultaneous submissions from the same participant can never both
// pass — exactly one wins, the rest are rejected as duplicates.
async function saveSubmissionIfAbsent(sub: any, mode: QuizMode = "live"): Promise<boolean> {
  const res = await redisCommand([
    "SET",
    quizKeys(mode).submission(sub.participantId, sub.questionId),
    JSON.stringify(sub),
    "EX",
    86400,
    "NX",
  ]);
  return res === "OK";
}

// Atomically record the fastest correct answer for a question. EVAL runs as a
// single atomic unit on Redis, so near-simultaneous correct submissions can
// never both overwrite the leaderboard — only a genuinely faster response wins.
const FASTEST_LUA = `
local key = KEYS[1]
local latestKey = KEYS[2]
local newTime = tonumber(ARGV[1])
local json = ARGV[2]
local cur = redis.call('GET', key)
local curTime
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if ok and obj and obj.responseTimeMs then curTime = tonumber(obj.responseTimeMs) end
end
if (not curTime) or newTime < curTime then
  redis.call('SET', key, json, 'EX', 86400)
  redis.call('SET', latestKey, json, 'EX', 86400)
  return 1
end
return 0
`;

async function recordFastestIfFaster(mode: QuizMode, qid: number, fastestObj: any): Promise<boolean> {
  const keys = quizKeys(mode);
  const res = await redisCommand([
    "EVAL",
    FASTEST_LUA,
    "2",
    keys.fastest(qid),
    keys.fastestLatest,
    String(fastestObj.responseTimeMs),
    JSON.stringify(fastestObj),
  ]);
  return res === 1;
}

async function getClubScore(club: string, mode: QuizMode = "live"): Promise<number> {
  const v = await redis.get<string>(quizKeys(mode).clubScore(club));
  return v ? parseInt(String(v), 10) || 0 : 0;
}

async function addClubScore(club: string, pts: number, mode: QuizMode = "live") {
  if (pts > 0) {
    await redis.incrby(quizKeys(mode).clubScore(club), pts);
  }
}

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
  await redis.set(keys.clubScore("STACK_PUSH"), "0");
  await redis.set(keys.clubScore("IT_INNOVATORS"), "0");
  await redisCommand(["DEL", keys.state, keys.nextId, keys.sessionGen, keys.kickedTokens]);
  await delKeys(getQuestionIds(mode).map((qid) => keys.fastest(qid)));
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
  await redis.set(keys.clubScore("STACK_PUSH"), "0");
  await redis.set(keys.clubScore("IT_INNOVATORS"), "0");
  await delKeys(getQuestionIds(mode).map((qid) => keys.fastest(qid)));
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
    res.json({ ok: false, redis: false, error: e.message });
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
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/lock-answers`, requireAdmin, async (_req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "LOCKED")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> LOCKED` });
    }
    const state = await setState(mode, { status: "LOCKED" });
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/reveal-answer`, requireAdmin, async (_req, res) => {
    const cur = await getState(mode);
    if (!canTransition(cur.status, "REVEALED")) {
      return res.status(400).json({ error: `Invalid transition: ${cur.status} -> REVEALED` });
    }
    const q = getQuestion(cur.currentQuestionId, mode);
    const state = await setState(mode, { status: "REVEALED", correctAnswer: q?.correctAnswer ?? null });
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
        p.fastestStreak = 0;
        p.bonusPoints = 0;
        await redis.set(keys.participantKey(p.sessionToken), JSON.stringify(p), { ex: 86400 });
        for (const qid of getQuestionIds(mode)) {
          await redisCommand(["DEL", keys.submission(p.id, qid)]);
        }
      }
    }

    const state = await setState(mode, {
      status: "PREPARING",
      currentQuestionId: null,
      questionStartedAt: null,
      countdownEndsAt: null,
      questionEndsAt: null,
      correctAnswer: null,
    });
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
    res.json({ ok: true, message: "All data cleared — fresh event is in PREPARING state", state });
  });

  router.post(`${prefix}/admin/end-quiz`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { status: "FINISHED" });
    res.json({ ok: true, state });
  });

  router.post(`${prefix}/admin/logout-all-students`, requireAdmin, async (_req, res) => {
    const gen = await logoutAllStudents(mode);
    res.json({ ok: true, message: "All students logged out. Their sessions are now invalid.", sessionGeneration: gen });
  });

  // ── Student Portal Gate (registration on/off) ───────────────────────────────
  // While the portal is closed, new students cannot register or join. The host
  // opens it when ready (e.g. right before the event) and can close it again
  // (e.g. after everyone is in) to stop late logins.
  router.post(`${prefix}/admin/open-portal`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { portalOpen: true });
    res.json({ ok: true, portalOpen: true, state });
  });

  router.post(`${prefix}/admin/close-portal`, requireAdmin, async (_req, res) => {
    const state = await setState(mode, { portalOpen: false });
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

    const members = await Promise.all(
      unique.map(async (p) => {
        const submitted = currentQ ? !!(await getSubmission(p.id, currentQ.id, mode)) : false;
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
          fastestStreak: p.fastestStreak || 0,
          bonusPoints: p.bonusPoints || 0,
          submitted,
          // Admin-only endpoint — token needed for the individual kick action.
          sessionToken: String(p.sessionToken || ""),
        };
      })
    );

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
      ["GET", keys.clubScore("STACK_PUSH")],
      ["GET", keys.clubScore("IT_INNOVATORS")],
      ["HGETALL", keys.participantsMap],
      ["GET", keys.state],
    ]);
    if (results === REDIS_UNAVAILABLE) throw new RedisUnavailableError();
    const [stackRaw, innovRaw, rawMap, stateRaw] = Array.isArray(results) ? results : [undefined, undefined, undefined, undefined];

    const s = stackRaw ? parseInt(String(stackRaw), 10) || 0 : 0;
    const i = innovRaw ? parseInt(String(innovRaw), 10) || 0 : 0;

    // Deterministic student leaderboard: score DESC, correctCount DESC,
    // joinedAt ASC, id ASC. Stable tie-breakers guarantee equal-score students
    // never randomly reorder between polls.
    const participants = parseHGetAll(rawMap);
    const sorted = [...participants].sort(compareParticipants);
    const students = sorted.map((p) => ({
      id: Number(p.id) || 0,
      name: String(p.name || ""),
      club: String(p.club || ""),
      score: p.score || 0,
      correctCount: p.correctCount || 0,
      correctResponseMs: p.correctResponseMs || 0,
      fastestStreak: p.fastestStreak || 0,
      bonusPoints: p.bonusPoints || 0,
      joinedAt: p.joinedAt ?? null,
    }));
    const topStudents = students.slice(0, 3).map((p, idx) => ({ ...p, rank: idx + 1 }));

    let state: QuizSessionState;
    const parsed = parseState(stateRaw as string | null);
    if (!parsed) {
      state = { ...DEFAULT_STATE };
    } else {
      const before = JSON.stringify(parsed);
      state = applyAutoTransitions(parsed, mode);
      if (JSON.stringify(state) !== before) {
        await redis.set(keys.state, JSON.stringify(state));
      }
    }

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

      // Test-portal member cap: the practice quiz admits at most
      // TEST_MODE_MAX_MEMBERS students. The live event portal is unlimited.
      if (mode === "test") {
        const memberCount = await countRegisteredParticipants(mode);
        if (memberCount >= TEST_MODE_MAX_MEMBERS) {
          return res.status(403).json({
            code: "PORTAL_FULL",
            error: `The test portal is full (maximum ${TEST_MODE_MAX_MEMBERS} members). Please wait for the host to free a spot.`,
          });
        }
      }

      const nextId = await redis.incr(quizKeys(mode).nextId);
      const id = Number(nextId) || Date.now();
      const gen = await getSessionGen(mode);

      const token = encodeToken({ id, name: n, club: String(club), gen });
      const participant = { id, name: n, club, sessionToken: token, gen, score: 0, correctCount: 0, wrongCount: 0, attemptCount: 0, correctResponseMs: 0, fastestStreak: 0, bonusPoints: 0, joinedAt: new Date().toISOString() };
      await saveParticipant(participant, mode);
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
          fastestStreak: 0,
          bonusPoints: 0,
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
    const parsed = parseState(stateRaw as string | null);
    if (!parsed) {
      state = { ...DEFAULT_STATE };
    } else {
      const before = JSON.stringify(parsed);
      state = applyAutoTransitions(parsed, mode);
      if (JSON.stringify(state) !== before) {
        await redis.set(keys.state, JSON.stringify(state));
      }
    }

    const currentQ = getQuestion(state.currentQuestionId, mode);
    const submission = currentQ ? await getSubmission(participant.id, currentQ.id, mode) : null;
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
      participant: { id: participant.id, name: participant.name, club: participant.club, score: participant.score, correctCount: participant.correctCount, wrongCount: participant.wrongCount || 0, attemptCount: participant.attemptCount, correctResponseMs: participant.correctResponseMs || 0, fastestStreak: participant.fastestStreak || 0, bonusPoints: participant.bonusPoints || 0, sessionToken: participant.sessionToken },
      hasSubmitted: !!submission,
      userSubmission: sanitizeSubmission(submission),
      currentQuestion: showQuestion && currentQ ? sanitizeQuestion(currentQ) : null,
      sessionStatus: state.status,
      countdownEndsAt: state.countdownEndsAt,
      questionEndsAt: state.questionEndsAt,
      durationSeconds: state.durationSeconds || QUESTION_SECONDS,
      correctAnswer: state.status === "REVEALED" ? state.correctAnswer : null,
    });
  });

  // ── Answer Submission ───────────────────────────────────────────────────────
  router.post(`${prefix}/questions/submit`, async (req, res) => {
    try {
      const { token, answer, questionId } = req.body ?? {};
      const rawToken = String(token || "");
      const participant = await getParticipant(rawToken, mode);
      if (!participant) {
        const rejection = await participantRejection(rawToken, mode);
        return res.status(rejection.status).json({ error: rejection.error, code: rejection.code });
      }

      const state = await getState(mode);
      if (state.status !== "LIVE") return res.status(400).json({ error: "Question is not live" });

      const currentQ = getQuestion(state.currentQuestionId, mode);
      if (!currentQ || currentQ.id !== Number(questionId)) return res.status(400).json({ error: "Wrong question" });

      const a = String(answer || "").trim().toUpperCase();
      if (!["A", "B", "C", "D"].includes(a)) return res.status(400).json({ error: "Answer must be A/B/C/D" });

      const now = Date.now();
      const startedAt = state.questionStartedAt ? new Date(state.questionStartedAt).getTime() : now;
      const { isCorrect, pointsAwarded } = evaluateSubmission(a, currentQ.correctAnswer, currentQ.points);
      const responseTimeMs = Math.max(0, now - startedAt);

      const sub = { id: now, participantId: participant.id, participantName: participant.name, club: participant.club, questionId: currentQ.id, questionNumber: currentQ.questionNumber, answer: a, isCorrect, pointsAwarded, responseTimeMs, submittedAt: new Date(now).toISOString() };
      const saved = await saveSubmissionIfAbsent(sub, mode);
      if (!saved) return res.status(400).json({ error: "Already submitted" });

      participant.score = (participant.score || 0) + pointsAwarded;
      participant.correctCount = (participant.correctCount || 0) + (isCorrect ? 1 : 0);
      participant.wrongCount = (participant.wrongCount || 0) + (isCorrect ? 0 : 1);
      participant.attemptCount = (participant.attemptCount || 0) + 1;
      // Winner ranking uses both correctness AND speed: accumulate the total
      // response time on CORRECT answers so equal scorers are ranked by who
      // answered correctly fastest (see compareParticipants).
      if (isCorrect) {
        participant.correctResponseMs = (participant.correctResponseMs || 0) + responseTimeMs;
      }

      let bonusAwarded = 0;
      // 🔥 FASTEST-STREAK BONUS: every 3 questions answered correctly AND
      // fastest in a row (contiguous) awards FASTEST_STREAK_BONUS extra points.
      // The streak resets on any wrong answer or when someone else was faster.
      if (isCorrect) {
        const fastestObj = {
          participantId: participant.id,
          participantName: participant.name,
          club: participant.club,
          responseTimeMs,
          responseTimeSec: (responseTimeMs / 1000).toFixed(2),
          questionNumber: currentQ.questionNumber,
          answer: a,
        };
        const isFastest = await recordFastestIfFaster(mode, currentQ.id, fastestObj);
        participant.fastestStreak = isFastest ? (participant.fastestStreak || 0) + 1 : 0;
        if ((participant.fastestStreak || 0) > 0 && (participant.fastestStreak || 0) % 3 === 0) {
          bonusAwarded = FASTEST_STREAK_BONUS;
          participant.bonusPoints = (participant.bonusPoints || 0) + bonusAwarded;
          participant.score = (participant.score || 0) + bonusAwarded;
          await addClubScore(participant.club, bonusAwarded, mode);
        }
      } else {
        participant.fastestStreak = 0;
      }

      await saveParticipant(participant, mode);
      await addClubScore(participant.club, pointsAwarded, mode);

      res.json({
        ok: true,
        submission: sanitizeSubmission(sub),
        participantScore: participant.score,
        bonusAwarded,
        fastestStreak: participant.fastestStreak || 0,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Submission failed" });
    }
  });
}

// Dual-mount — register the live quiz (no prefix) and the test quiz (/test)
registerModeRoutes(r, "", "live");
registerModeRoutes(r, "/test", "test");

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
  res.status(500).json({ error: err?.message || "Internal server error" });
});

export { app };
export default app;
