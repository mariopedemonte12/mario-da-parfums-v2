import { createWsClient } from "./client";

export const chatbotWs = createWsClient(
  process.env.NEXT_PUBLIC_CHATBOT_WS_URL ?? "ws://localhost:8081"
);
