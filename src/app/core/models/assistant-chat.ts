export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface EngineSession {
  id: string;
  title?: string;
}

export interface EngineTextPart {
  type: string;
  text?: string;
}

export interface EngineMessageResponse {
  info: { id: string; role: string };
  parts: EngineTextPart[];
}

export interface MandateState {
  origin: string | null;
  destination: string | null;
  cargo: string | null;
  weight_kg: number | null;
  target_rate: number | null;
  currency: string | null;
  target_date: string | null;
}

export function emptyMandateState(): MandateState {
  return {
    origin: null,
    destination: null,
    cargo: null,
    weight_kg: null,
    target_rate: null,
    currency: null,
    target_date: null,
  };
}

const STATE_MARKER = /\[\[STATE:(\{[\s\S]*?\})\]\]/;

export function assistantReplyFrom(response: EngineMessageResponse): { text: string; state: MandateState | null } {
  const raw = response.parts
    .filter((part) => part.type === 'text' && part.text?.trim())
    .map((part) => part.text!.trim())
    .join('\n\n');

  let state: MandateState | null = null;
  const match = raw.match(STATE_MARKER);
  if (match) {
    try {
      state = { ...emptyMandateState(), ...JSON.parse(match[1]) };
    } catch {
      state = null;
    }
  }
  const text = stripMarkdown(raw.replace(STATE_MARKER, '').trim());
  return { text, state };
}

// The bubbles render plain text; drop any markdown the model slips in.
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*•]\s+/gm, '– ');
}
