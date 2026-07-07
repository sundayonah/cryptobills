import { NextResponse } from 'next/server';
import config from '@/lib/config';
import { isQwenAsrConfigured, transcribeAudio } from '@/lib/qwen-asr';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!config.qwen_agent_enabled || !config.qwen_voice_enabled) {
    return NextResponse.json({ error: 'Voice input is disabled' }, { status: 404 });
  }

  if (!isQwenAsrConfigured()) {
    return NextResponse.json(
      { error: 'Qwen ASR is not configured. Set QWENCLOUD_API_KEY and QWENCLOUD_ASR_MODEL.' },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const audio = formData.get('audio');

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }

    if (audio.size === 0) {
      return NextResponse.json({ error: 'Empty audio recording' }, { status: 400 });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file is too large (max 10 MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = audio.type || 'audio/webm';
    const text = await transcribeAudio({ base64, mimeType });

    return NextResponse.json({ text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    console.error('Qwen ASR error:', error);
    const status = message.includes('(400)') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
