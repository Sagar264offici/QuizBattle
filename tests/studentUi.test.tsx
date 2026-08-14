// @vitest-environment jsdom
/**
 * Student UI tests (jsdom): the TEST QUIZ entry point on the student join
 * page must be visible, and the bilingual warning modal must be shown BEFORE
 * the student can reach test mode.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import StudentPage from "../client/src/pages/StudentPage";

vi.mock("../client/src/socket", () => ({
  socket: { on: vi.fn(), off: vi.fn() },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderStudent() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <StudentPage mode="live" />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Student join page — TEST QUIZ access", () => {
  it("shows a clearly visible TEST QUIZ button on the live join form", async () => {
    renderStudent();
    const button = await screen.findByRole("button", { name: /TEST QUIZ/i });
    expect(button).toBeTruthy();
  });

  it("shows the bilingual warning modal BEFORE entering test mode", async () => {
    renderStudent();
    fireEvent.click(await screen.findByRole("button", { name: /TEST QUIZ/i }));

    // English warning text
    expect(screen.getByText(/This is ONLY for checking the connection/i)).toBeTruthy();
    expect(screen.getByText(/DO NOT OPEN THIS UNLESS THE HOST\/ORGANIZER HAS TOLD YOU TO/i)).toBeTruthy();
    // Hindi warning text
    expect(screen.getByText(/यह केवल कनेक्शन जाँचने और QuizBattle सिस्टम का परीक्षण करने के लिए है/i)).toBeTruthy();
    expect(screen.getByText(/जब तक होस्ट\/ऑर्गनाइज़र आपको न कहे, इसे न खोलें/i)).toBeTruthy();

    // We are still on the join page — the modal gates entry.
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("navigates to /test only after confirming the warning", async () => {
    renderStudent();
    fireEvent.click(await screen.findByRole("button", { name: /TEST QUIZ/i }));
    fireEvent.click(screen.getByRole("button", { name: /Enter Test Quiz/i }));
    expect(screen.getByTestId("location").textContent).toBe("/test");
  });

  it("Go Back closes the warning without navigating", async () => {
    renderStudent();
    fireEvent.click(await screen.findByRole("button", { name: /TEST QUIZ/i }));
    fireEvent.click(screen.getByRole("button", { name: /Go Back/i }));
    expect(screen.queryByText(/This is ONLY for checking the connection/i)).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
});
