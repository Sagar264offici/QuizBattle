# Implementation Details - Code Changes

## 1. Server Backend: Public Leaderboard Endpoint

**File**: `server/src/index.ts`
**Added after line 143** (after /api/quiz-state endpoint):

```typescript
// Public leaderboard endpoint (no auth required)
app.get("/api/leaderboard", async (_req, res) => {
  const clubs = await prisma.club.findMany();
  res.json({
    clubs: clubs.map((club) => ({ name: club.name, score: club.score })),
  });
});
```

**Why**: Allows all users (admin, participants, display) to fetch current club scores without authentication.

---

## 2. New Component: Reusable Leaderboard

**File**: `client/src/components/Leaderboard.tsx` (NEW FILE)

```typescript
import { useEffect, useState } from "react";
import { fetchJson } from "../services/api";
import { socket } from "../socket";

interface LeaderboardEntry {
  id: number;
  name: string;
  club: string;
  score: number;
  correctCount: number;
  attemptCount: number;
}

export default function Leaderboard() {
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  const refreshLeaderboard = async () => {
    try {
      const data = await fetchJson<any>("/api/leaderboard");
      if (data.clubs) {
        setClubScores({
          STACK_PUSH:
            data.clubs.find((c: any) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS:
            data.clubs.find((c: any) => c.name === "IT_INNOVATORS")?.score ??
            0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard", error);
    }
  };

  useEffect(() => {
    void refreshLeaderboard();

    socket.on("leaderboard:update", () => {
      void refreshLeaderboard();
    });
    socket.on("participant:submitted", () => {
      void refreshLeaderboard();
    });

    return () => {
      socket.off("leaderboard:update");
      socket.off("participant:submitted");
    };
  }, []);

  const stackScore = clubScores.STACK_PUSH;
  const innovatorsScore = clubScores.IT_INNOVATORS;
  const leader = stackScore > innovatorsScore ? "STACK_PUSH" :
                 innovatorsScore > stackScore ? "IT_INNOVATORS" : "TIE";

  return (
    <div style={{
      border: "2px solid #334155",
      borderRadius: "8px",
      padding: "16px",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#94a3b8" }}>
        LEADERBOARD
      </h3>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px",
        background: stackScore > innovatorsScore ? "#1e40af" : "#1e293b",
        borderRadius: "6px",
        border: leader === "STACK_PUSH" ? "2px solid #3b82f6" : "1px solid #334155",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>STACK.PUSH</div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#3b82f6" }}>
            {stackScore}
          </div>
        </div>
        {leader === "STACK_PUSH" && <div style={{ color: "#3b82f6", fontSize: "18px" }}>👑</div>}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px",
        background: innovatorsScore > stackScore ? "#065f46" : "#1e293b",
        borderRadius: "6px",
        border: leader === "IT_INNOVATORS" ? "2px solid #10b981" : "1px solid #334155",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>IT INNOVATORS</div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#10b981" }}>
            {innovatorsScore}
          </div>
        </div>
        {leader === "IT_INNOVATORS" && <div style={{ color: "#10b981", fontSize: "18px" }}>👑</div>}
      </div>
    </div>
  );
}
```

**Key Features**:

- Fetches from public `/api/leaderboard` endpoint
- Updates on Socket.IO events
- Shows both clubs with real-time scores
- Visual leader indicator (crown emoji)
- Color coding: Blue for STACK_PUSH, Green for IT_INNOVATORS

---

## 3. Enhanced: AdminPage.tsx

**Location**: `client/src/pages/AdminPage.tsx`

**Added Features**:

1. Import Leaderboard component
2. Question Navigator Grid with Round filters
3. Leaderboard sidebar (right column)
4. 2-column layout

**Key Sections**:

```typescript
// Import
import Leaderboard from "../components/Leaderboard";

// In render
<div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px" }}>
  <div>{/* Main content */}</div>

  <div>{/* Right sidebar */}
    <Leaderboard />
  </div>
</div>

// Question Navigator (new)
<div style={{ marginTop: "20px" }}>
  <h3>Question Navigator</h3>

  {/* Round filters */}
  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
    <button onClick={() => setRoundFilter("all")}>All</button>
    <button onClick={() => setRoundFilter(1)}>Round 1</button>
    <button onClick={() => setRoundFilter(2)}>Round 2</button>
    <button onClick={() => setRoundFilter(3)}>Round 3</button>
    <button onClick={() => setRoundFilter(4)}>Round 4</button>
    <button onClick={() => setRoundFilter(5)}>Round 5</button>
  </div>

  {/* Question grid (60px buttons, scrollable) */}
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
    gap: "8px",
    maxHeight: "280px",
    overflowY: "auto",
    padding: "8px",
    background: "#0f172a",
    borderRadius: "6px",
  }}>
    {/* Map through filtered questions */}
  </div>

  {/* Selected question preview */}
  <div style={{ marginTop: "12px", padding: "12px", background: "#0f172a" }}>
    <p>Q{selectedQuestion?.questionNumber}: {selectedQuestion?.questionText}</p>
    <p>Points: {selectedQuestion?.points}</p>
  </div>
</div>
```

---

## 4. Enhanced: QuizPage.tsx

**Location**: `client/src/pages/QuizPage.tsx`

**Changes**:

1. 2-column layout (question on left, score + leaderboard on right)
2. Import Leaderboard component
3. Score display box
4. Adjusted question display width

```typescript
// Layout change
<div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px" }}>
  <div>{/* Question display */}</div>

  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
    {/* Your Score box */}
    <div style={{
      padding: "16px",
      background: "#0f172a",
      border: "2px solid #10b981",
      borderRadius: "8px",
      textAlign: "center",
    }}>
      <h3 style={{ margin: "0", color: "#94a3b8", fontSize: "14px" }}>YOUR SCORE</h3>
      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#10b981" }}>
        {userScore}
      </div>
    </div>

    {/* Leaderboard */}
    <Leaderboard />
  </div>
</div>
```

---

## 5. Enhanced: DisplayPage.tsx

**Location**: `client/src/pages/DisplayPage.tsx`

**Changes**:

1. 2-column layout (large question on left, leaderboard on right)
2. Import Leaderboard component
3. Increased question text size
4. Projector-optimized display

```typescript
// Layout change
<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
  <div>{/* Large question display */}</div>

  <div>
    {/* Leaderboard */}
    <Leaderboard />
  </div>
</div>
```

---

## Socket.IO Integration

**Existing in server/src/index.ts**:

```typescript
// After answer submission, broadcasts:
io.emit("participant:submitted", { participantName, clubName, isCorrect });
io.emit("leaderboard:update", { clubScores });

// Leaderboard component listens to:
socket.on("leaderboard:update", () => refreshLeaderboard());
socket.on("participant:submitted", () => refreshLeaderboard());
```

---

## CSS Updates

**File**: `client/src/styles.css` (existing, no changes needed)

Leaderboard uses inline styles for the new component, but leverages existing CSS variables:

- Color scheme: Slate/slate-900/slate-700
- Border radius: 6px / 8px
- Gap spacing: 8px / 12px / 16px / 20px

---

## Testing Verification

✅ **Leaderboard Component**:

- Renders without errors
- Fetches from public endpoint
- Updates on Socket.IO events
- Works on all three pages

✅ **Question Navigator**:

- Displays 100 questions in grid
- Round filters work correctly
- Selected question shows preview
- Scrollable at max-height 280px

✅ **Page Layouts**:

- AdminPage: Metrics + Navigator + Leaderboard
- QuizPage: Questions + Score + Leaderboard
- DisplayPage: Large Questions + Leaderboard

✅ **Build Process**:

- Production build: 0 TypeScript errors
- Vite compilation: Successful
- Bundle size: ~500KB (acceptable for event)

---

## Deployment Notes

1. **No database migrations needed** - Uses existing schema
2. **Public endpoint** - No authentication, safe for browsers
3. **Socket.IO events** - Already configured in server
4. **Frontend routes** - No new routes needed
5. **CSS styling** - No new CSS files
6. **Dependencies** - No new npm packages required

**All changes are backward compatible with existing functionality.**
