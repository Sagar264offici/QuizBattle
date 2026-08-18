import React from "react";

/**
 * Renders question text with proper code formatting.
 *
 * Any question whose FIRST line ends with a "?" (e.g. "What is the output?",
 * "What happens here?", "What pattern is produced?", "In C++, what is the
 * output?", "What does this function return?", "What is printed?") followed by
 * content on the next lines is treated as a prompt + code block — the code is
 * rendered in a styled <pre> so line breaks, indentation and pattern shapes are
 * preserved. Everything else renders as plain text.
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
  // Prompt (first line ending with "?") + code (everything after it).
  const codeMatch = text.match(/^([^\n]*\?\s*\n)([\s\S]+)$/);

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
