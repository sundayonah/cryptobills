const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Common ASR mishearings for Nigerian bill payments (apply before number parsing). */
const PHONETIC_FIXES: Array<[RegExp, string]> = [
  [/\bandre\s+nera\b/gi, '100 naira'],
  [/\bandre\s+naira\b/gi, '100 naira'],
  [/\bandre\s+near\b/gi, '100 naira'],
  [/\bhunder\s+naira\b/gi, '100 naira'],
  [/\bhunder\s+nera\b/gi, '100 naira'],
  [/\bunder\s+naira\b/gi, '100 naira'],
  [/\bunder\s+nera\b/gi, '100 naira'],
  [/\bone\s+under\b/gi, 'one hundred'],
  [/\ba\s+under\b/gi, 'a hundred'],
  [/\bhundred\s+nera\b/gi, '100 naira'],
  [/\bone\s+nera\b/gi, '100 naira'],
  [/\bwon\s+hundred\b/gi, 'one hundred'],
  [/\btwo\s+nera\b/gi, '200 naira'],
  [/\bfive\s+nera\b/gi, '500 naira'],
  [/\bnera\b/gi, 'naira'],
  [/\bnaira\s+mtn\b/gi, 'naira MTN'],
];

const MISHEARING_FIXES: Array<[RegExp, string]> = [
  [/\beight\s+time\b/gi, 'airtime'],
  [/\b8\s+time\b/gi, 'airtime'],
  [/\ba\s+time\b/gi, 'airtime'],
  [/\bem\s+tee\s+en\b/gi, 'MTN'],
  [/\bem\s+t\s+n\b/gi, 'MTN'],
  [/\bempty\s+en\b/gi, 'MTN'],
  [/\bglo\b/gi, 'GLO'],
  [/\bair\s+tel\b/gi, 'Airtel'],
  [/\bnine\s*mobile\b/gi, '9mobile'],
  [/\btop\s+up\b/gi, 'top up'],
  [/\bsend\s+to\b/gi, 'for'],
  [/\bsend,?\s+/gi, 'send '],
];

const SPOKEN_AMOUNT_SNIPPETS: Array<[RegExp, string]> = [
  [/\b(?:a|one)\s+hundred\s+naira\b/gi, '100 naira'],
  [/\b(?:a|one)\s+thousand\s+naira\b/gi, '1000 naira'],
  [/\btwo\s+hundred\s+naira\b/gi, '200 naira'],
  [/\bfive\s+hundred\s+naira\b/gi, '500 naira'],
  [/\bten\s+thousand\s+naira\b/gi, '10000 naira'],
  [/\bhundred\s+naira\b/gi, '100 naira'],
  [/\bthousand\s+naira\b/gi, '1000 naira'],
  [/\b(?:a|one)\s+hundred\b/gi, '100'],
  [/\b(?:a|one)\s+thousand\b/gi, '1000'],
  [/\btwo\s+hundred\b/gi, '200'],
  [/\bfive\s+hundred\b/gi, '500'],
  [/\bten\s+thousand\b/gi, '10000'],
];

/** Nigerian mobile number: 11 digits starting with 0. */
export const NIGERIAN_PHONE_PATTERN = /0[789][01]\d{8}/;

export function hasValidNigerianPhone(text: string): boolean {
  return NIGERIAN_PHONE_PATTERN.test(text.replace(/\s/g, ''));
}

function cleanAsrPunctuation(text: string): string {
  return text
    .replace(/[,;]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpokenAmount(words: string[]): number | null {
  let total = 0;
  let current = 0;

  for (const raw of words) {
    const word = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) continue;

    if (word === 'and') continue;

    if (word === 'hundred') {
      current = (current || 1) * 100;
      continue;
    }

    if (word === 'thousand') {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
      continue;
    }

    if (word === 'million') {
      current = (current || 1) * 1_000_000;
      total += current;
      current = 0;
      continue;
    }

    const value = NUMBER_WORDS[word];
    if (value === undefined) {
      return null;
    }

    current += value;
  }

  total += current;
  return total > 0 ? total : null;
}

/** Convert spoken digit sequences like "zero eight one six..." into phone numbers. */
function replaceSpokenDigitRuns(text: string): string {
  const pattern =
    /\b(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine)(?:[\s.-]+(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine)){9,10}\b/gi;

  return text.replace(pattern, (match) => {
    const digits = match
      .toLowerCase()
      .split(/[\s.-]+/)
      .map((word) => DIGIT_WORDS[word.replace(/[^a-z]/g, '')] ?? '')
      .join('');

    if (digits.length >= 10 && digits.length <= 11) {
      return digits.startsWith('0') ? digits : `0${digits}`;
    }

    return match;
  });
}

/** Shorter digit runs (4–9 digits) often used when users say amounts digit-by-digit. */
function replaceSpokenAmountDigitRuns(text: string): string {
  const pattern =
    /\b(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine)(?:[\s.-]+(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine)){3,8}\b/gi;

  return text.replace(pattern, (match) => {
    const digits = match
      .toLowerCase()
      .split(/[\s.-]+/)
      .map((word) => DIGIT_WORDS[word.replace(/[^a-z]/g, '')] ?? '')
      .join('');

    if (digits.length >= 4 && digits.length <= 9) {
      const amount = parseInt(digits, 10);
      if (amount >= 50 && amount <= 500_000) {
        return String(amount);
      }
    }

    return match;
  });
}

/** Convert amount phrases like "one hundred naira" into "100 naira". */
function replaceSpokenAmounts(text: string): string {
  const pattern =
    /\b(?:(?:zero|oh|o|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and)(?:[\s.-]+(?:(?:zero|oh|o|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and)))+)(?:\s+naira|\s+bucks)?\b/gi;

  return text.replace(pattern, (match) => {
    const words = match.toLowerCase().split(/[\s.-]+/).filter(Boolean);
    const amountWords = words.filter((w) => w !== 'naira' && w !== 'bucks');
    const amount = parseSpokenAmount(amountWords);
    if (amount === null) return match;

    const suffix = words.some((w) => w === 'naira') ? ' naira' : '';
    return `${amount}${suffix}`;
  });
}

function normalizeEmbeddedPhones(text: string): string {
  let result = text.replace(/\+234(\d{10})\b/g, '0$1');
  result = result.replace(/\b(0[789][01])[\s.-]?(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{2,4})\b/g, '$1$2$3$4');
  return result;
}

export function normalizeVoiceTranscript(text: string): string {
  let normalized = cleanAsrPunctuation(text);

  for (const [pattern, replacement] of PHONETIC_FIXES) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of MISHEARING_FIXES) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of SPOKEN_AMOUNT_SNIPPETS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = replaceSpokenAmounts(normalized);
  normalized = replaceSpokenAmountDigitRuns(normalized);
  normalized = replaceSpokenDigitRuns(normalized);
  normalized = normalizeEmbeddedPhones(normalized);

  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}
