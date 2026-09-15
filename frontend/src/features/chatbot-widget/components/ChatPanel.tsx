"use client";

import { useEffect, useRef, useState } from "react";

import WindLines from "@/components/ui/WindLines";
import { cn } from "@/lib/utils";

import { useChatbotWidget } from "./ChatbotWidgetProvider";
import MessageBubble from "./MessageBubble";
import SenseiAvatar from "./SenseiAvatar";
import SenseiMascot from "./SenseiMascot";
import TypingIndicator from "./TypingIndicator";

const CONNECTION_LABEL: Record<string, string> = {
  idle: "conectando…",
  connecting: "conectando…",
  open: "en línea",
  closed: "sin conexión",
  error: "sin conexión",
};

export default function ChatPanel() {
  const {
    isOpen,
    close,
    messages,
    connectionState,
    turnInProgress,
    isThinking,
    statusText,
    sendMessage,
  } = useChatbotWidget();

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || turnInProgress) return;
    sendMessage(draft);
    setDraft("");
  }

  const hasMessages = messages.length > 0;
  const canSend = draft.trim().length > 0 && !turnInProgress;

  return (
    <div
      role="dialog"
      aria-label="Chat con el sensei"
      className="fixed right-4 bottom-4 z-50 flex h-[min(620px,calc(100vh-32px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-[22px] border border-border bg-background shadow-xl"
    >
      <div className="relative flex items-center gap-3.5 border-b border-border px-5 py-[18px]">
        <SenseiAvatar />
        <div>
          <div className="font-serif text-xl font-medium">Sensei</div>
          <div className="mt-1 font-sans text-[11px] font-light tracking-[0.14em] text-text-muted uppercase">
            maestro de perfumes · {CONNECTION_LABEL[connectionState]}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar chat"
          className="ml-auto text-lg text-text-muted transition-colors hover:text-text"
        >
          ×
        </button>
        <WindLines
          variant="sw"
          className="pointer-events-none absolute inset-x-0 -bottom-px h-2.5 w-full"
        />
      </div>

      {hasMessages ? (
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5"
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isThinking && <TypingIndicator statusText={statusText} />}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
          <SenseiMascot className="h-auto w-[180px]" />
          <div className="text-center">
            <div className="font-serif text-xl font-medium">El Sensei</div>
            <div className="mt-2 font-sans text-[11px] leading-relaxed font-light tracking-[0.14em] text-text-muted uppercase">
              tinta sumi-e · respira en reposo
              <br />
              describe un momento y te propone un perfume
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 border-t border-border px-4 py-[14px] pb-[18px]"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={turnInProgress}
          placeholder="Escribe al sensei…"
          className="flex-1 border-0 bg-transparent font-serif text-lg text-text italic outline-none placeholder:text-text-muted disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar mensaje"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-background transition-opacity",
            !canSend && "opacity-40"
          )}
        >
          ↑
        </button>
      </form>
    </div>
  );
}
