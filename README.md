# QuizBattle

A real-time IT club quiz platform for a live college event.

## Features

- On-the-spot participant registration with club selection
- Real-time quiz state and broadcasting via Socket.IO
- Admin dashboard for question control and score reveal
- Projector display for live audience view
- Club, individual, and fastest-correct leaderboards
- SQLite + Prisma data model for persistence
- Secure admin login using the configured admin password
- Seed script to import the PDF-based question set

## Requirements

- Node.js 20+
- npm
- A modern browser on the host laptop or event network

## Setup

1. Install dependencies:
   npm install
2. Copy environment file:
   cp .env.example .env
3. Generate Prisma client and initialize database:
   npx prisma generate
   npx prisma db push
4. Seed the quiz data from the PDF-derived source:
   npm run seed
5. Start development servers:
   npm run dev

## Environment variables

- PORT: server port, default 3000
- DATABASE_URL: SQLite database path
- ADMIN_PASSWORD: admin login password
- SESSION_SECRET: session secret for secure cookies
- CLIENT_URL: frontend origin for CORS
- NODE_ENV: development/production

## Admin login

- URL: http://localhost:5173/admin/login
- Password: MadeBySagar

## Participant URL

- http://localhost:5173/join

## Projector URL

- http://localhost:5173/display

## LAN setup

Bind the host to 0.0.0.0 by starting the app on the laptop connected to the event network. Then participants can use the host's LAN IP, for example:

- http://192.168.1.100:3000/join
- http://192.168.1.100:3000/admin/login
- http://192.168.1.100:3000/display

## Event workflow

1. Start the app.
2. Open the admin login page and sign in.
3. Prepare the question set and start the first question.
4. Participants register on the join page and choose their club.
5. Ask participants to submit answers during the live question.
6. Lock the question, reveal the correct answer, and compute scores.
7. Advance to the next question until the event ends.
8. Use reset controls carefully when needed.

## Reset process

- Reset current question: clears current question submissions only
- Reset entire quiz: clears participant scores, club points, and live state but keeps question database intact
- End quiz: marks the event as finished

## Troubleshooting

- If the database is stale, run: npx prisma db push
- If the seed is not loaded, run: npm run seed
- If Socket.IO clients are disconnected, refresh the browser and rejoin the session
- If admin auth fails, verify the ADMIN_PASSWORD value in .env

## Notes

This project follows the authoritative PDF question set and is meant for live event use on a college network.
# QuizBattle
