import { createQwenChatCompletion } from '@/lib/qwen-cloud';

const REFINE_SYSTEM_PROMPT = `You correct voice transcripts for Nigerian mobile airtime payments.

Output ONE short sentence only. Include:
- Amount in digits with "naira" (fix mishearings like "Andre Nera" -> 100 naira)
- Network if mentioned: MTN, GLO, Airtel, or 9mobile
- The word airtime when relevant
- Phone number as exactly 11 digits starting with 0 when present in the transcript

Rules:
- Preserve every phone digit you can infer from the transcript; digit-by-digit speech like "zero eight one..." must become one continuous number.
- Do not invent digits that are not in the transcript.
- If the phone number is clearly incomplete, still output what you have and append "[incomplete phone]".
- No commas. No extra commentary.`;

export async function refineVoiceTranscript(rawTranscript: string): Promise<string> {
  const trimmed = rawTranscript.trim();
  if (!trimmed) return trimmed;

  const completion = await createQwenChatCompletion({
    messages: [
      { role: 'system', content: REFINE_SYSTEM_PROMPT },
      { role: 'user', content: trimmed },
    ],
  });

  const refined = completion.choices[0]?.message?.content?.trim();
  return refined || trimmed;
}
