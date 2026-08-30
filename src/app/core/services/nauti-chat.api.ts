import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { NAUTI_ENGINE_AGENT, NAUTI_ENGINE_BASE } from '../config';
import { EngineMessageResponse, EngineSession } from '../models/assistant-chat';

@Injectable({ providedIn: 'root' })
export class NautiChatApi {
  private readonly http = inject(HttpClient);

  createSession(title: string): Observable<EngineSession> {
    return this.http.post<EngineSession>(`${NAUTI_ENGINE_BASE}/session`, { title });
  }

  sendMessage(sessionId: string, text: string, clientContext?: string): Observable<EngineMessageResponse> {
    return this.http.post<EngineMessageResponse>(`${NAUTI_ENGINE_BASE}/session/${sessionId}/message`, {
      agent: NAUTI_ENGINE_AGENT,
      ...(clientContext ? { system: clientContext } : {}),
      parts: [{ type: 'text', text }],
    });
  }
}
