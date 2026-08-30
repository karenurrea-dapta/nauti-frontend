export interface VoiceCallAnalysis {
  call_summary?: string;
  in_voicemail?: boolean;
  user_sentiment?: string;
  call_successful?: boolean;
  custom_analysis_data?: {
    quoted_date?: string;
    quoted_price?: number | string;
    quoted_currency?: string;
    [key: string]: unknown;
  };
}

export interface VoiceCallDetail {
  id: string;
  call_id: string;
  agent_id?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  call_status?: string;
  duration_ms?: string | number;
  created_at?: string;
  recording_url?: string;
  disconnection_reason?: string;
  call_analysis?: VoiceCallAnalysis;
  transcript?: string;
  dynamic_variables?: Record<string, string>;
  contact_name?: string;
}

export interface TranscriptTurn {
  role: 'agent' | 'user';
  text: string;
}

export function parseTranscript(transcript: string | null | undefined): TranscriptTurn[] {
  if (!transcript) {
    return [];
  }
  const turns: TranscriptTurn[] = [];
  for (const line of transcript.split('\n')) {
    const text = line.trim();
    if (!text) {
      continue;
    }
    if (text.startsWith('Agent:')) {
      turns.push({ role: 'agent', text: text.slice(6).trim() });
    } else if (text.startsWith('User:')) {
      turns.push({ role: 'user', text: text.slice(5).trim() });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${text}`;
    }
  }
  return turns;
}
