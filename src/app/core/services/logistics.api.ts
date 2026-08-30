import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE, BATCH_API_BASE } from '../config';
import { AnalyticsKpis } from '../models/analytics';
import { Call } from '../models/call';
import {
  CallBatch,
  DaptaBatchPoll,
  DaptaDispatchRequest,
  DaptaDispatchResponse,
  DispatchCallsRequest,
} from '../models/call-batch';
import { Carrier, CarrierListQuery, CarrierListResponse, CarrierWrite } from '../models/carrier';
import { Client, ClientWrite } from '../models/client';
import { Commitment, CommitmentListQuery } from '../models/commitment';
import {
  CallOutboundRequest,
  CallOutboundResponse,
  CreateOperationRequest,
  NormalizeMandateValueRequest,
  NormalizeMandateValueResponse,
  Operation,
} from '../models/operation';
import { PrimaryRoute } from '../models/primary-route';
import { VoiceCallDetail } from '../models/voice-call';
import { Quote, QuoteListQuery } from '../models/quote';
import { AppUser, BootstrapUserRequest } from '../models/user';

function queryParams(values: Record<string, string | number | undefined | null>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      params[key] = text;
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class LogisticsApi {
  private readonly http = inject(HttpClient);

  listCarriers(query: CarrierListQuery = {}): Observable<CarrierListResponse> {
    return this.http.get<CarrierListResponse>(`${API_BASE}/carriers`, {
      params: queryParams({
        q: query.q,
        route: query.route,
        page: query.page,
        page_size: query.page_size,
        client_id: query.client_id,
      }),
    });
  }

  createCarrier(body: CarrierWrite): Observable<Carrier> {
    return this.http.post<Carrier>(`${API_BASE}/carriers`, body);
  }

  updateCarrier(id: string, body: CarrierWrite): Observable<Carrier> {
    return this.http.put<Carrier>(`${API_BASE}/carriers/${id}`, {
      name: body.name,
      owner_name: body.owner_name,
      phone: body.phone,
      email: body.email,
      type: body.type,
      supported_routes: body.supported_routes,
      info_link: body.info_link,
      agent_summary: body.agent_summary,
    });
  }

  listQuotes(query: QuoteListQuery = {}): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${API_BASE}/quotes`, {
      params: queryParams({
        q: query.q,
        operation_id: query.operation_id,
        carrier_id: query.carrier_id,
        call_id: query.call_id,
        status: query.status,
        client_id: query.client_id,
        client_email: query.client_email,
        client_phone: query.client_phone,
      }),
    });
  }

  listPrimaryRoutes(): Observable<PrimaryRoute[]> {
    return this.http.get<PrimaryRoute[]>(`${API_BASE}/primary-routes`);
  }

  createPrimaryRoute(code: string, label = ''): Observable<PrimaryRoute> {
    return this.http.post<PrimaryRoute>(`${API_BASE}/primary-routes`, { code, label });
  }

  generateAgentSummary(infoLink: string, carrierName = ''): Observable<{ summary: string; info_link: string }> {
    return this.http.post<{ summary: string; info_link: string }>(`${API_BASE}/carriers/summarize`, {
      info_link: infoLink,
      carrier_name: carrierName,
    });
  }

  listClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${API_BASE}/clients`);
  }

  getClient(clientId: string): Observable<Client> {
    return this.http.get<Client>(`${API_BASE}/clients/${clientId}`);
  }

  createClient(body: ClientWrite): Observable<Client> {
    return this.http.post<Client>(`${API_BASE}/clients`, body);
  }

  createOperation(body: CreateOperationRequest): Observable<Operation> {
    return this.http.post<Operation>(`${API_BASE}/operations`, body);
  }

  normalizeMandateValue(
    body: NormalizeMandateValueRequest,
  ): Observable<NormalizeMandateValueResponse> {
    return this.http.post<NormalizeMandateValueResponse>(`${API_BASE}/operations/normalize`, body);
  }

  callOutbound(body: CallOutboundRequest): Observable<CallOutboundResponse> {
    return this.http.post<CallOutboundResponse>(`${API_BASE}/operations/call-outbound`, body);
  }

  dispatchOperationCalls(operationId: string, body: DispatchCallsRequest = {}): Observable<CallBatch> {
    return this.http.post<CallBatch>(`${API_BASE}/operations/${operationId}/dispatch`, body);
  }

  startDaptaBatch(body: DaptaDispatchRequest): Observable<DaptaDispatchResponse> {
    return this.http.post<DaptaDispatchResponse>(`${BATCH_API_BASE}/batches`, body);
  }

  getVoiceCall(callId: string): Observable<VoiceCallDetail> {
    return this.http.get<VoiceCallDetail>(`${BATCH_API_BASE}/calls/${callId}`);
  }

  pollDaptaBatch(batchId: string): Observable<DaptaBatchPoll> {
    return this.http.post<DaptaBatchPoll>(`${BATCH_API_BASE}/dapta/call-batch`, {
      batch_id: batchId,
    });
  }

  listOperations(clientId?: string): Observable<Operation[]> {
    return this.http.get<Operation[]>(`${API_BASE}/operations`, {
      params: queryParams({ client_id: clientId }),
    });
  }

  getOperation(operationId: string): Observable<Operation> {
    return this.http.get<Operation>(`${API_BASE}/operations/${operationId}`);
  }

  listCalls(clientId?: string): Observable<Call[]> {
    return this.http.get<Call[]>(`${API_BASE}/calls`, {
      params: queryParams({ client_id: clientId }),
    });
  }

  getUser(uid: string): Observable<AppUser> {
    return this.http.get<AppUser>(`${API_BASE}/users/${uid}`);
  }

  bootstrapUser(body: BootstrapUserRequest): Observable<AppUser> {
    return this.http.post<AppUser>(`${API_BASE}/users/bootstrap`, body);
  }

  listCommitments(query: CommitmentListQuery = {}): Observable<Commitment[]> {
    return this.http.get<Commitment[]>(`${API_BASE}/commitments`, {
      params: queryParams({
        q: query.q,
        operation_id: query.operation_id,
        carrier_id: query.carrier_id,
        call_id: query.call_id,
        recap_sent: query.recap_sent,
        client_id: query.client_id,
        client_email: query.client_email,
        client_phone: query.client_phone,
      }),
    });
  }

  getAnalyticsKpis(clientId?: string): Observable<AnalyticsKpis> {
    return this.http.get<AnalyticsKpis>(`${API_BASE}/api/analytics/kpis`, {
      params: queryParams({ client_id: clientId }),
    });
  }
}
