import { cn } from "@/lib/utils";

import type { ChatMessage } from "../types/chatbot.types";

type MessageBubbleProps = {
  message: ChatMessage;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
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
      {message.text}
    </div>
  );
}
