import React from "react";

/**
 * Renders question text with proper code formatting.
 * Detects "Guess the Output" style questions where the text after the
 * prompt is code and wraps it in a styled <pre> block.
 */
export default function QuestionText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Detect code-style questions: "What will be the output?\n..."
  const codeMatch = text.match(
    /^(What will be the output\??\s*\n)([\s\S]+)$/i,
  );

  if (codeMatch) {
    const [, prompt, code] = codeMatch;
    return (
      <div className={className} style={style}>
        <span>{prompt.trimEnd()}</span>
        <pre
          style={{
            marginTop: "10px",
            padding: "12px 16px",
            background: "rgba(0, 0, 0, 0.35)",
            borderRadius: "8px",
            border: "1px solid rgba(120, 140, 180, 0.15)",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: "0.92em",
            lineHeight: "1.6",
            whiteSpace: "pre",
            color: "#e2e8f0",
            overflowX: "auto",
          }}
        >
          {code.trimEnd()}
        </pre>
      </div>
    );
  }

  // Fallback: plain text
  return (
    <div className={className} style={style}>
      {text}
    </div>
  );
}
