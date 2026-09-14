"use client";

import { useEffect, useRef, useState } from "react";

import type { WsConnectionState } from "@/lib/ws/client";
import { chatbotWs } from "@/lib/ws/clients";

import type { ChatMessage } from "../types/chatbot.types";

let messageIdCounter = 0;
function createMessageId() {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}`;
}

const CONNECTION_LOST_TEXT = "Se perdió la conexión con el sensei. Probá de nuevo.";
const CONNECTION_FAILED_TEXT = "No se pudo conectar con el sensei. Probá de nuevo.";

export function useChatbotSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<WsConnectionState>(() =>
    chatbotWs.getState()
  );
  const [turnInProgress, setTurnInProgress] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const turnInProgressRef = useRef(false);
  const streamingIdRef = useRef<string | null>(null);

  function setTurn(inProgress: boolean) {
    turnInProgressRef.current = inProgress;
    setTurnInProgress(inProgress);
    if (!inProgress) {
      setIsThinking(false);
    }
  }

  function failTurn(text: string) {
    streamingIdRef.current = null;
    setStatusText(null);
    setTurn(false);
    setMessages((prev) => [...prev, { id: createMessageId(), role: "error", text }]);
  }

  useEffect(() => {
    function fail(text: string) {
      streamingIdRef.current = null;
      turnInProgressRef.current = false;
      setStatusText(null);
      setTurnInProgress(false);
      setIsThinking(false);
      setMessages((prev) => [...prev, { id: createMessageId(), role: "error", text }]);
    }

    const unsubscribeState = chatbotWs.onStateChange((state) => {
      setConnectionState(state);

      if ((state === "closed" || state === "error") && turnInProgressRef.current) {
        fail(CONNECTION_LOST_TEXT);
      }
    });

    const unsubscribeMessage = chatbotWs.onMessage((message) => {
      switch (message.type) {
        case "status":
          setStatusText(message.text);
          break;

        case "token":
          setIsThinking(false);
          setStatusText(null);
          setMessages((prev) => {
            if (streamingIdRef.current) {
              return prev.map((existing) =>
                existing.id === streamingIdRef.current
                  ? { ...existing, text: existing.text + message.text }
                  : existing
              );
            }

            const id = createMessageId();
            streamingIdRef.current = id;
            return [...prev, { id, role: "assistant", text: message.text }];
          });
          break;

        case "done":
          streamingIdRef.current = null;
          turnInProgressRef.current = false;
          setStatusText(null);
          setTurnInProgress(false);
          setIsThinking(false);
          break;

        case "error":
          fail(message.text);
          break;
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeMessage();
    };
  }, []);

  function ensureConnected() {
    const state = chatbotWs.getState();
    if (state === "idle" || state === "closed" || state === "error") {
      chatbotWs.connect();
    }
  }

  function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || turnInProgressRef.current) {
      return;
    }

    setMessages((prev) => [...prev, { id: createMessageId(), role: "user", text }]);
    setTurn(true);
    setIsThinking(true);
    setStatusText(null);
    streamingIdRef.current = null;

    if (chatbotWs.getState() === "open") {
      chatbotWs.send({ type: "message", text });
      return;
    }

    const unsubscribe = chatbotWs.onStateChange((next) => {
      if (next === "open") {
        unsubscribe();
        chatbotWs.send({ type: "message", text });
      } else if (next === "error" || next === "closed") {
        unsubscribe();
        failTurn(CONNECTION_FAILED_TEXT);
      }
    });

    chatbotWs.connect();
  }

  return {
    messages,
    connectionState,
    turnInProgress,
    isThinking,
    statusText,
    sendMessage,
    ensureConnected,
  };
}
