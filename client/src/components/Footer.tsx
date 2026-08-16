const GITHUB_URL = "https://github.com/Sagar264offici/QuizBattle";
const LINKEDIN_URL = "https://www.linkedin.com/in/sagarakanoone/";

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function LinkedInIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: "auto",
        padding: "20px 16px 12px",
        textAlign: "center",
        borderTop: "1px solid var(--border-subtle)",
        color: "var(--text-dim)",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
        <span>Made by Sagar Pathak</span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub — Sagar264offici/QuizBattle"
          aria-label="GitHub"
          style={{ display: "inline-flex", color: "var(--text-muted)", transition: "color 0.2s ease" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "")}
        >
          <GitHubIcon />
        </a>
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="LinkedIn — Sagar Pathak"
          aria-label="LinkedIn"
          style={{ display: "inline-flex", color: "var(--text-muted)", transition: "color 0.2s ease" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0a66c2")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "")}
        >
          <LinkedInIcon />
        </a>
      </div>
    </footer>
  );
}
