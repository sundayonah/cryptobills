import config from '@/lib/config';
import { getQwenBaseUrl } from '@/lib/qwen-cloud';
import { normalizeVoiceTranscript } from '@/lib/voice-transcript-normalize';
import { refineVoiceTranscript } from '@/lib/qwen-voice-refine';

interface QwenAsrResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const ASR_CONTEXT =
  'Nigerian mobile bill payment. Amounts in naira. Networks: MTN, GLO, Airtel, 9mobile. Phone numbers as eleven digits starting with zero, for example 08012345678.';

export function isQwenAsrConfigured(): boolean {
  return Boolean(config.qwencloud_api_key.trim() && config.qwencloud_asr_model.trim());
}

function toDataUri(base64: string, mimeType: string): string {
  const normalizedMime = mimeType.split(';')[0]?.trim() || 'audio/webm';
  const supportedMime =
    normalizedMime === 'audio/webm' ||
      normalizedMime === 'audio/wav' ||
      normalizedMime === 'audio/mpeg' ||
      normalizedMime === 'audio/mp4' ||
      normalizedMime === 'audio/ogg'
      ? normalizedMime
      : 'audio/webm';

  return `data:${supportedMime};base64,${base64}`;
}

function buildAsrRequestBody(dataUri: string) {
  return {
    model: config.qwencloud_asr_model,
    messages: [
      {
        role: 'system',
        content: [{ text: ASR_CONTEXT }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: dataUri,
            },
          },
        ],
      },
    ],
    stream: false,
    asr_options: {
      language: 'en',
      enable_itn: true,
    },
  };
}

function buildAsrRequestBodyMinimal(dataUri: string) {
  return {
    model: config.qwencloud_asr_model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: dataUri,
            },
          },
        ],
      },
    ],
    stream: false,
    asr_options: {
      language: 'en',
      enable_itn: true,
    },
  };
}

async function callQwenAsr(baseUrl: string, apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen ASR error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  return response.json() as Promise<QwenAsrResponse>;
}

export async function transcribeAudio(params: {
  base64: string;
  mimeType: string;
}): Promise<string> {
  const apiKey = config.qwencloud_api_key.trim();
  if (!apiKey) {
    throw new Error('QWENCLOUD_API_KEY is not configured');
  }

  const baseUrl = getQwenBaseUrl();
  const dataUri = toDataUri(params.base64, params.mimeType);

  let data: QwenAsrResponse;
  try {
    data = await callQwenAsr(baseUrl, apiKey, buildAsrRequestBody(dataUri));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('(400)')) {
      data = await callQwenAsr(baseUrl, apiKey, buildAsrRequestBodyMinimal(dataUri));
    } else {
      throw error;
    }
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('No speech detected. Please try again.');
  }

  const normalized = normalizeVoiceTranscript(text);

  try {
    const refined = await refineVoiceTranscript(normalized);
    return refined.trim() || normalized;
  } catch (error) {
    console.warn('Voice transcript refine failed, using normalized text:', error);
    return normalized;
  }
}
