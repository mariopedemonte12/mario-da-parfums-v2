import ReactMarkdown, { type Components } from "react-markdown";

import { cn } from "@/lib/utils";

import FragranceCards from "./FragranceCards";
import type { ChatMessage } from "../types/chatbot.types";

type MessageBubbleProps = {
  message: ChatMessage;
};

// Assistant prose only — Gemini reliably emits **bold**/lists even though
// nothing asks it to, so leaving it as raw text showed literal asterisks to
// the user. Kept intentionally narrow (no links/images/headings styled) —
// links, images and embedded product cards stay out of scope for the
// assistant's own text, see specs/chatbot-widget.md.
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,
  ul: ({ children }) => <ul className="mt-1 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1 list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children }) => <span>{children}</span>,
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  if (message.fragrances) {
    return <FragranceCards items={message.fragrances} />;
  }

  const isUser = message.role === "user";
  const isError = message.role === "error";

  return (
    <div
      className={cn(
        "max-w-[82%] rounded-2xl px-4 py-3 font-sans text-sm font-light",
        isUser && "self-end rounded-br-[4px] bg-primary text-background",
        !isUser && !isError && "self-start rounded-bl-[4px] bg-surface text-text",
        isError &&
          "self-start rounded-bl-[4px] border border-destructive/40 bg-destructive/10 text-destructive"
      )}
    >
      {isUser || isError ? (
        message.text
      ) : (
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{message.text}</ReactMarkdown>
      )}
    </div>
  );
}
