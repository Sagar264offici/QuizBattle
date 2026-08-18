import React from "react";

/**
 * Renders question text with proper code formatting.
 *
 * Detects "Guess The Output"-style questions — the prompt line followed by
 * code on the next lines ("What is the output?\n…", "What will be the
 * output?\n…", "How many times does the following loop print?\n…") — and
 * renders the code part in a styled <pre> block. Everything else renders as
 * plain text.
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
  // Prompt line + code (everything after the first line break).
  const codeMatch = text.match(
    /^(What (?:is|will be) the output\??\s*\n|How many times does the following loop print\??\s*\n)([\s\S]+)$/i,
  );

  if (codeMatch) {
    const [, prompt, code] = codeMatch;
    return (
      <div className={className} style={style}>
        <span>{prompt.trimEnd()}</span>
        <pre className="code-block">
          <code>{code.trim()}</code>
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
