export type StdioMcpServerConfig = {
  id: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type HttpMcpServerConfig = {
  id: string;
  transport: 'http';
  url: string;
};

export type McpServerConfig = StdioMcpServerConfig | HttpMcpServerConfig;

export type ChatbotConfig = {
  geminiApiKey: string;
  agentModel: string;
  classifierModel: string;
  wsHost: string;
  wsPort: number;
  agentHistoryTurns: number;
  classifierHistoryTurns: number;
  maxToolIterations: number;
  rejectionMessage: string;
  mcpServers: McpServerConfig[];
};
