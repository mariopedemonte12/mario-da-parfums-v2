"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { useChatbotSession } from "../hooks/useChatbotSession";

type ChatbotWidgetContextValue = ReturnType<typeof useChatbotSession> & {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
};

const ChatbotWidgetContext = createContext<ChatbotWidgetContextValue | null>(null);

export function ChatbotWidgetProvider({ children }: { children: ReactNode }) {
  const session = useChatbotSession();
  const [isOpen, setIsOpen] = useState(false);

  function toggle() {
    // ensureConnected() is a side effect, kept out of the setIsOpen updater
    // (same reasoning as useChatbotSession's token handling): Strict Mode
    // invokes updaters twice, and a side effect inside one isn't guaranteed
    // to run exactly once.
    const next = !isOpen;
    if (next) {
      session.ensureConnected();
    }
    setIsOpen(next);
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <ChatbotWidgetContext.Provider value={{ ...session, isOpen, toggle, close }}>
      {children}
    </ChatbotWidgetContext.Provider>
  );
}

export function useChatbotWidget() {
  const context = useContext(ChatbotWidgetContext);
  if (!context) {
    throw new Error("useChatbotWidget must be used within a ChatbotWidgetProvider");
  }
  return context;
}
