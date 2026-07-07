import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAgentRateLimit } from '@/lib/utils';
import config from '@/lib/config';
import { isQwenAgentConfigured } from '@/lib/qwen-cloud';
import { runQwenAgent } from '@/lib/qwen-agent';

const CHAT_RATE_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

export const dynamic = 'force-dynamic';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  if (!config.qwen_agent_enabled) {
    return NextResponse.json({ error: 'Qwen agent is disabled' }, { status: 404 });
  }

  if (!isQwenAgentConfigured()) {
    return NextResponse.json(
      { error: 'Qwen Cloud is not configured. Set QWENCLOUD_API_KEY and QWENCLOUD_MODEL.' },
      { status: 503 },
    );
  }

  const rateLimit = checkAgentRateLimit(request, CHAT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many agent requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec ?? 60) },
      },
    );
  }

  try {
    const body = await request.json();
    const { messages } = chatSchema.parse(body);
    const response = await runQwenAgent(messages);
    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.flatten() }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Agent request failed';
    console.error('Qwen agent error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
