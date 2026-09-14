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
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        session.ensureConnected();
      }
      return next;
    });
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
