# QuizBattle — STARFORGE Team Selection

QuizBattle is a live team-selection quiz application. The active **Live Quiz** is populated from the supplied *STARFORGE TEAM SELECTION QUIZ* PDF.

## Quiz rules and content

- 50 situational-judgment questions across six sections.
- One point for each correct response; no negative marking.
- The active quiz does not award speed bonuses, so the maximum score is 50.
- The answer key stays in the server-side question data and is not sent to participants before reveal.
- The existing `/test` mode remains isolated from the active Live Quiz.

The source of truth is `server/src/data/questionsData.ts`. Update that file and redeploy to change the live question bank.

## Local setup

Requirements: Node.js 22, npm, and Git.

```bash
git clone https://github.com/Sagar264offici/QuizBattle.git
cd QuizBattle
npm install
cp .env.example .env
```

Edit `.env` and replace `ADMIN_PASSWORD` and `SESSION_SECRET` with unique values. Local development defaults to the in-memory state store; this does not write to Firebase or Upstash.

Start the frontend and backend:

```bash
npm run dev
```

Local URLs:

- Participant: http://localhost:5173/join
- Admin: http://localhost:5173/admin/login
- Projector: http://localhost:5173/display
- API health: http://localhost:3000/api/health

Keep the Terminal process running. In local memory mode, participants and quiz state are temporary and will be lost when the backend restarts.

## Firebase Hosting + Realtime Database deployment

This branch adds Firebase Hosting and Cloud Functions configuration. The server uses Firebase Realtime Database as a shared state store under the isolated `quizbattleRedis` namespace. There is no need to manually enter the 50 questions in the Firebase console: they are deployed with the server code.

1. Create or select a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Use your existing **Realtime Database** at `https://quiz-dbaa4-default-rtdb.asia-southeast1.firebasedatabase.app`. The function is configured for `asia-southeast1` to match this database region.
3. Enable billing for Cloud Functions if Firebase requires it for your project. Review the applicable Firebase and Google Cloud quotas/pricing before a live event.
4. Install the Firebase CLI and sign in:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

5. Set a strong admin password in Secret Manager:

   ```bash
   firebase functions:secrets:set ADMIN_PASSWORD
   ```

   Enter the password at the prompt; do not commit it to GitHub or paste it into chat.

6. Install dependencies and deploy Hosting + Functions:

   ```bash
   npm install
   npm run deploy:firebase
   ```

The build hook compiles the frontend and TypeScript API before deployment. Firebase Hosting serves the frontend and rewrites `/api/**` to the `quizApi` function. Verify the live API at `https://YOUR_PROJECT_ID.web.app/api/health`.

### Realtime behavior

The API state is persisted in Firebase Realtime Database and shared across requests. Firebase Cloud Functions are request-based, so this deployment uses the client's REST polling fallback rather than a persistent Socket.IO server. For a single-campus quiz, this provides live shared state with polling delay. If persistent Socket.IO push across connections is essential, run the Node server on Cloud Run and keep Firebase Realtime Database as its state store.

### Security

- Never commit `.env`, service-account JSON files, Upstash tokens, or production admin passwords.
- Production admin authentication fails closed when `ADMIN_PASSWORD` is not configured.
- There is no default admin password; set it in the local `.env` file or Firebase Secret Manager.
- Firebase Admin access is server-side; do not make the `quizbattleRedis` data path publicly writable through client database rules.

## Legacy Upstash option

The adapter can still use Upstash when `QUIZ_STORE` is not set to `firebase` or `memory` and both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Keep those values in deployment environment variables only. Hard-coded Upstash credentials have been removed from this branch.
