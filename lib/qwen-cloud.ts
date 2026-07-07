import config from '@/lib/config';
import { fetchWithTimeout } from '@/lib/utils';

export interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: QwenToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface QwenToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface QwenToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface QwenChatCompletionResponse {
  choices: Array<{
    message: QwenChatMessage;
    finish_reason: string;
  }>;
}

export function getQwenBaseUrl(): string {
  const explicit = config.qwencloud_base_url.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const workspaceId = config.qwencloud_workspace_id.trim();
  if (workspaceId) {
    return `https://${workspaceId}.${config.qwencloud_region}.maas.aliyuncs.com/compatible-mode/v1`;
  }

  return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
}

export function isQwenAgentConfigured(): boolean {
  return Boolean(config.qwencloud_api_key.trim() && config.qwencloud_model.trim());
}

export async function createQwenChatCompletion(params: {
  messages: QwenChatMessage[];
  tools?: QwenToolDefinition[];
}): Promise<QwenChatCompletionResponse> {
  const apiKey = config.qwencloud_api_key.trim();
  if (!apiKey) {
    throw new Error('QWENCLOUD_API_KEY is not configured');
  }

  const baseUrl = getQwenBaseUrl();
  const body: Record<string, unknown> = {
    model: config.qwencloud_model,
    messages: params.messages,
    enable_thinking: false,
  };

  if (params.tools?.length) {
    body.tools = params.tools;
    body.tool_choice = 'auto';
  }

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  return response.json() as Promise<QwenChatCompletionResponse>;
}
