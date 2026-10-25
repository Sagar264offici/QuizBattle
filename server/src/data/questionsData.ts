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

type RawQuestion = {
  questionText: string;
  options: [string, string, string, string];
  correctAnswer: "A" | "B" | "C" | "D";
};

type QuizSection = {
  name: string;
  questions: RawQuestion[];
};

// Source: STARFORGE TEAM SELECTION QUIZ PDF supplied for this project.
// Keep the answer key server-side; participant responses are sanitized by the API.
const SECTIONS: QuizSection[] = [
  {
    name: "ROUND 1 — LISTENING AND UNDERSTANDING",
    questions: [
      { questionText: "A teammate explains a project idea quickly, but you are unsure what the main goal is. What should you do first?", options: ["Briefly restate what you understood and ask them to confirm or correct it.", "Start building the part you think they meant.", "Wait until someone else explains it again.", "Agree now so the discussion can move on."], correctAnswer: "A" },
      { questionText: "During an online discussion, the audio cuts out while someone gives an important requirement. What is the best response?", options: ["Guess the missing detail from the context.", "Ignore it unless someone notices later.", "Say what you missed and ask them to repeat the key requirement.", "Ask another teammate to decide what was probably said."], correctAnswer: "C" },
      { questionText: "A teammate proposes a solution that differs from the one you suggested. What is the most useful next step?", options: ["Reject it because the team already heard your idea.", "Ask them to explain their reasoning, then compare both ideas against the goal.", "Let them decide without discussing the trade-offs.", "Support your idea more strongly so the team stays focused."], correctAnswer: "B" },
      { questionText: "You receive a long message containing several project requirements. How should you avoid missing an important detail?", options: ["Read only the last sentence because it is probably the most important.", "Start work immediately and ask questions only if it fails.", "Summarize the requirements and confirm the priorities and deadline.", "Forward the message to everyone without checking what it means."], correctAnswer: "C" },
      { questionText: "A teammate says a task is due 'tomorrow', but team members are in different schedules. What should you clarify?", options: ["Assume it means midnight in your own time zone.", "The exact date, time and relevant time zone.", "Ask them to shorten the task instead.", "Wait until tomorrow to find out what they meant."], correctAnswer: "B" },
      { questionText: "You disagree with a teammate while they are still explaining their reasoning. What is the best response?", options: ["Let them finish, then explain your concern and ask a clarifying question.", "Interrupt immediately so your objection is not forgotten.", "Stay silent during the meeting and complain afterward.", "Tell the group that their plan will not work before hearing the details."], correctAnswer: "A" },
      { questionText: "One team member has been quiet during a planning discussion. How can you include them?", options: ["Invite their view directly, give them time to respond, and avoid putting them on the spot aggressively.", "Assume they have nothing to add.", "Assign them the least important task without asking.", "Ask another teammate to speak on their behalf."], correctAnswer: "A" },
      { questionText: "A teammate explains a complicated issue using unfamiliar terms. What is the best way to make sure you understand?", options: ["Pretend to understand so you do not look inexperienced.", "Change the topic to something you already know.", "Search for a random explanation while they keep talking.", "Ask them to explain the key part in simpler terms or give an example."], correctAnswer: "D" },
      { questionText: "You are not sure whether a proposed feature is meant for the first demo or a later version. What should you do?", options: ["Build both versions to avoid asking a question.", "Assume every suggested feature is mandatory for the first demo.", "Leave the feature out without telling anyone.", "Ask which version it belongs in and what outcome is required for the demo."], correctAnswer: "D" }
    ]
  },
  {
    name: "ROUND 2 — COMMUNICATION AND FEEDBACK",
    questions: [
      { questionText: "A teammate's work has a recurring issue that is delaying integration. Which feedback is most constructive?", options: ["Tell them they are careless and need to improve.", "Describe the specific issue, its impact, and one practical next step.", "Say nothing and quietly rewrite everything yourself.", "Complain about them to other members first."], correctAnswer: "B" },
      { questionText: "You discover that you misunderstood a requirement and built the wrong thing. What should you do?", options: ["Blame the requirement because it was not explained perfectly.", "Hide the mistake until someone finds it.", "Keep the work and argue that it is good enough.", "Own the mistake, explain the impact, and propose the fastest correction."], correctAnswer: "D" },
      { questionText: "A teammate has more experience than you in an area you do not know well. How should you approach their explanation?", options: ["Listen, ask focused questions, and check your understanding before acting.", "Avoid asking anything because they may judge you.", "Disagree with their advice to show independence.", "Ask them to do the entire task instead of learning the basics."], correctAnswer: "A" },
      { questionText: "A teammate reacts defensively to your feedback. What is the most productive response?", options: ["Repeat the criticism more loudly so they take it seriously.", "Return to the specific task and evidence, and ask how you can resolve the issue together.", "End the discussion and leave the problem unresolved.", "Tell the rest of the team that this person cannot accept feedback."], correctAnswer: "B" },
      { questionText: "A judge asks about a feature you have not built or tested. What should you say?", options: ["Claim it works and hope the judge does not ask for a demo.", "Give a vague answer that makes the feature sound complete.", "Clearly separate what currently works from what is planned or unverified.", "Blame a teammate for not finishing it."], correctAnswer: "C" },
      { questionText: "A disagreement in a text chat is getting worse because messages sound harsher than intended. What is the best move?", options: ["Send longer messages proving why you are right.", "Add more people to the chat to pressure the other person.", "Stop responding and assume the issue will disappear.", "Switch to a brief direct conversation, clarify intent, and agree on the next action."], correctAnswer: "D" }
    ]
  },
  {
    name: "ROUND 3 — PROBLEM-SOLVING AND CRITICAL THINKING",
    questions: [
      { questionText: "A problem statement is vague. Before proposing a solution, what should the team do?", options: ["Choose the most advanced technology available.", "Define the user, goal, constraints, and what success would look like.", "Start coding and let the requirements emerge later.", "Copy a solution from a popular project without checking fit."], correctAnswer: "B" },
      { questionText: "You have three possible causes for a bug and limited time. What is the best approach?", options: ["Test the most informative, low-cost hypothesis first and observe the result.", "Change several parts of the code at once.", "Choose the cause that sounds most complicated.", "Rewrite the whole module before collecting evidence."], correctAnswer: "A" },
      { questionText: "The team likes a proposed solution but has no evidence it will work. What should happen next?", options: ["Treat agreement from the team as proof.", "Build the full version before testing the risky assumption.", "Create a small test with a clear success criterion.", "Add more features to make the idea more convincing."], correctAnswer: "C" },
      { questionText: "New evidence contradicts the team's initial assumption. What is the strongest response?", options: ["Ignore the evidence to avoid wasting prior effort.", "Update the assumption and adjust the plan based on the evidence.", "Keep the original plan because changing it looks weak.", "Remove the evidence from the presentation."], correctAnswer: "B" },
      { questionText: "A feature breaks immediately after a code change. What should you do first?", options: ["Randomly change unrelated files until the error disappears.", "Reproduce the problem and inspect the recent change and error information.", "Delete the feature without checking the cause.", "Assume the framework is broken and switch frameworks."], correctAnswer: "B" },
      { questionText: "There is only one hour left and the demo still lacks its main workflow. What is the best priority?", options: ["Add several small features to make the app look bigger.", "Redesign the full interface from scratch.", "Start integrating a new external service.", "Complete one reliable end-to-end workflow and defer nonessential polish."], correctAnswer: "D" },
      { questionText: "A teammate suggests a complex architecture for a simple first prototype. What should the team consider?", options: ["Use the most complex architecture to impress the judges.", "Build the smallest design that meets the core requirements and can be extended later.", "Reject all planning and put everything in one file.", "Adopt the architecture without asking what problem it solves."], correctAnswer: "B" },
      { questionText: "Requirements change twice during development. How can the team reduce confusion?", options: ["Keep all versions of the requirements equally active.", "Let every developer follow whichever version they prefer.", "Avoid documenting changes because it takes time.", "Record the current decision, explain what changed, and confirm the updated scope."], correctAnswer: "D" },
      { questionText: "You do not know the answer to a technical question and cannot verify it immediately. What is the most responsible response?", options: ["State what you know, identify the uncertainty, and explain how you would verify it.", "Invent a confident answer to maintain momentum.", "Repeat an unverified claim from memory as a fact.", "Avoid the question and move on without acknowledging it."], correctAnswer: "A" }
    ]
  },
  {
    name: "ROUND 4 — TEAMWORK AND CONFLICT",
    questions: [
      { questionText: "A teammate misses a task they agreed to deliver. What should you do first?", options: ["Publicly embarrass them in the team chat.", "Take over every task they own without discussing it.", "Ask what blocked them, agree on a realistic next step, and surface deadline risk.", "Ignore the delay until the final presentation."], correctAnswer: "C" },
      { questionText: "Two members strongly disagree about which technology to use. How should the decision be made?", options: ["Choose the technology used by the most senior member automatically.", "Choose whichever option has the more impressive name.", "Keep debating until one person gives up.", "Compare both options against requirements, time, risks and team capability."], correctAnswer: "D" },
      { questionText: "One member dominates every meeting and others cannot contribute. What should the facilitator do?", options: ["Set clear turns for input and explicitly invite other members' views.", "Let the strongest voice decide because it is faster.", "Cancel meetings and allow everyone to work separately.", "Ask the quieter members to stop contributing ideas."], correctAnswer: "A" },
      { questionText: "A teammate suggests an idea you believe is weak. What is the best response?", options: ["Call the idea stupid so the team moves on.", "Agree in the meeting and sabotage the idea later.", "Reject it without explanation to save time.", "Explain the concern with a reason and offer a way to test or improve the idea."], correctAnswer: "D" },
      { questionText: "Two team members have unknowingly started the same task. What should you do?", options: ["Check what each has completed, combine useful work, and clarify ownership going forward.", "Delete one person's work without reviewing it.", "Let both continue even if time is limited.", "Blame them for not coordinating without fixing the process."], correctAnswer: "A" },
      { questionText: "A teammate is stuck and falling behind. What is the most helpful first step?", options: ["Take the task away without explanation.", "Tell them to work harder and leave.", "Ask what specifically is blocking them, then offer targeted help or pair up.", "Wait until they miss the deadline to intervene."], correctAnswer: "C" },
      { questionText: "The team cannot resolve a disagreement and a decision is needed soon. What is a fair approach?", options: ["Continue the debate until everyone agrees on every detail.", "Choose randomly without reviewing the options.", "Set a decision deadline, agree on criteria, hear the key arguments, and assign a decision owner.", "Let the loudest person decide without explaining why."], correctAnswer: "C" },
      { questionText: "A teammate promises a feature that seems unrealistic for the remaining time. What should you do?", options: ["Accept the promise and hope it works out.", "Discuss a smaller deliverable, estimate the effort, and make the risk visible early.", "Tell the judges the feature will definitely be ready.", "Remove the teammate from the project immediately."], correctAnswer: "B" },
      { questionText: "A genuine external problem means you may miss your task deadline. What should you do?", options: ["Wait until the deadline has passed before mentioning it.", "Make no changes to the plan and hope nobody notices.", "Tell the team early, explain the impact, and propose options for reducing the delay.", "Say the task is complete when it is not."], correctAnswer: "C" }
    ]
  },
  {
    name: "ROUND 5 — PRIORITIES UNDER PRESSURE",
    questions: [
      { questionText: "You have three tasks: one blocks everyone else, one improves the demo's appearance, and one adds an optional feature. What should you usually prioritize first?", options: ["Improve the appearance because judges see it first.", "Build the optional feature because it is more exciting.", "Split attention equally across all three regardless of impact.", "Unblock the dependent work, then reassess what is essential for the demo."], correctAnswer: "D" },
      { questionText: "A critical bug prevents the main demo flow from working, while a new feature could add extra value. What is the best choice?", options: ["Build the new feature first to increase the feature count.", "Fix or safely work around the critical bug before adding the new feature.", "Ignore the bug and prepare a verbal explanation.", "Change the whole tech stack to avoid debugging."], correctAnswer: "B" },
      { questionText: "An external API is down and there are 90 minutes left. What is a sensible response?", options: ["Keep retrying the API for the full 90 minutes.", "Pretend the mock data is a live API response.", "Use a clearly labelled mock or local fallback if it preserves the core demo, and disclose the limitation.", "Remove all core functionality related to the API without testing alternatives."], correctAnswer: "C" },
      { questionText: "A teammate is overwhelmed and several tasks remain. What should the team lead do?", options: ["Review the must-have tasks, redistribute work realistically, and agree on the minimum demo.", "Tell the teammate to handle everything faster.", "Add more features to motivate the team.", "Wait for the teammate to ask for help while the deadline approaches."], correctAnswer: "A" },
      { questionText: "A deployment fails 20 minutes before judging. What should you do?", options: ["Make large untested changes until deployment works.", "Delete the repository and re-create the project.", "Cancel the demo immediately without testing options.", "Check the logs, try a known-good fix or rollback, and preserve a local demo fallback."], correctAnswer: "D" },
      { questionText: "Half the features are incomplete and the deadline is close. What is the strongest strategy?", options: ["Show every incomplete screen as if it works.", "Finish and test one coherent core workflow rather than presenting many broken features.", "Start several more features to make the project look ambitious.", "Spend the remaining time changing colors and fonts only."], correctAnswer: "B" },
      { questionText: "A serious issue is discovered late in the project. What is the best response?", options: ["Hide it because there is no time to discuss it.", "Blame the person who last edited the code.", "Assess its severity, inform the team, and choose the safest practical fix or rollback.", "Deploy anyway without understanding the impact."], correctAnswer: "C" },
      { questionText: "A teammate proposes skipping all testing to save time. What is the best counterproposal?", options: ["Test nothing because a demo only needs to look good.", "Test every minor visual detail before the core journey.", "Delay testing until after the judges have evaluated the project.", "Test the core user journey and highest-risk cases, then fix any blocker found."], correctAnswer: "D" }
    ]
  },
  {
    name: "ROUND 6 — CREATIVITY, LEARNING AND OWNERSHIP",
    questions: [
      { questionText: "You need to use an unfamiliar tool within two hours. What is the most effective learning plan?", options: ["Watch tutorials for the entire two hours without trying anything.", "Read every page of the documentation before opening the tool.", "Learn the minimum relevant concepts, build a tiny example, and apply it to the task.", "Avoid the tool completely even if it is necessary."], correctAnswer: "C" },
      { questionText: "A creative feature sounds exciting but does not address the user's main problem. What should the team do?", options: ["Check the user need and demo goal before deciding whether the feature belongs in the MVP.", "Build it because creativity is always more important than usefulness.", "Keep adding related features until the original problem seems smaller.", "Include it only because it may look impressive in screenshots."], correctAnswer: "A" },
      { questionText: "Users say a feature is confusing. What is the best next step?", options: ["Ask where they got stuck, observe the behavior, and make a targeted improvement.", "Tell users they need to learn how to use it.", "Ignore the feedback because the team understands the feature.", "Remove the entire product without investigating the issue."], correctAnswer: "A" },
      { questionText: "You discover a similar product already exists. What should you do?", options: ["Claim your idea is completely original without checking further.", "Abandon the project immediately because no competition is allowed.", "Copy its branding and features so your product feels familiar.", "Study its scope and limitations, then define and test your specific differentiator."], correctAnswer: "D" },
      { questionText: "Someone claims a proposed solution is easy, but no one has tested it. What should the team ask for?", options: ["A confident verbal promise that it will work.", "More presentation slides describing the benefits.", "A small proof of concept or a concrete test that checks the risky assumption.", "A list of unrelated technologies that could be used."], correctAnswer: "C" },
      { questionText: "A prototype fails during testing. What is the most constructive team response?", options: ["Identify what failed, record the likely cause, fix or narrow the scope, and retest.", "Find one person to blame before investigating.", "Hide the failed test results from the team.", "Assume the entire idea is worthless after one failure."], correctAnswer: "A" },
      { questionText: "A teammate asks for urgent help while you are doing your own task. What should you do?", options: ["Check the urgency and dependency, agree on a brief way to unblock them, and communicate your own deadline.", "Drop your task immediately without checking its impact.", "Refuse to help because everyone must work independently.", "Ignore the message until your entire task is finished."], correctAnswer: "A" },
      { questionText: "The team completes a difficult task successfully. What is the best way to close it out?", options: ["Give all credit to the team lead regardless of contributions.", "Acknowledge contributions, document what worked, and confirm the next priority.", "Move on without sharing what was learned.", "Spend the meeting comparing who worked the longest."], correctAnswer: "B" },
      { questionText: "A teammate's approach is different from yours but meets the requirements and has been tested. What is the best response?", options: ["Force them to rewrite it to match your personal style.", "Accept the evidence, document the decision, and focus on integration and the shared goal.", "Keep arguing until they adopt your approach.", "Exclude their work even though it passes the agreed tests."], correctAnswer: "B" }
    ]
  }
];

export const ROUNDS: RoundItem[] = SECTIONS.map((section, index) => ({
  id: index + 1,
  name: section.name,
  pointValue: 1,
}));

export const QUESTIONS: QuestionItem[] = SECTIONS.flatMap((section, sectionIndex) =>
  section.questions.map((question, index) => {
    const id = SECTIONS.slice(0, sectionIndex).reduce((sum, prior) => sum + prior.questions.length, 0) + index + 1;
    return {
      id,
      questionNumber: id,
      roundId: sectionIndex + 1,
      roundName: section.name,
      points: 1,
      questionText: question.questionText,
      optionA: question.options[0],
      optionB: question.options[1],
      optionC: question.options[2],
      optionD: question.options[3],
      correctAnswer: question.correctAnswer,
    };
  })
);

// The source quiz specifies 50 questions, one mark each, and no negative marking.
if (QUESTIONS.length !== 50 || QUESTIONS.some((question) => question.points !== 1)) {
  throw new Error("STARFORGE quiz data must contain exactly 50 one-point questions.");
}
