import type {
  AuditLogView,
  ChangeRequestPayload,
  ChangeRequestSummary,
  CorrelationState,
  EventCorrelationView,
  ObservedEventView,
  RequestApprovalView,
  RequestExecutionView,
  RequestStatus,
  RequestTimelineItem,
  RequestType,
} from '@acam-ts/contracts';
import type { ChangeRequestRow, JsonObject } from '../database/schema';

export interface RequestSummaryBuildInput {
  request: Pick<
    ChangeRequestRow,
    | 'request_id'
    | 'request_number'
    | 'request_type'
    | 'status'
    | 'title'
    | 'justification'
    | 'submitted_at'
    | 'approved_at'
    | 'executed_at'
  >;
  payload: ChangeRequestPayload;
  requesterDisplayName: string;
  approverDisplayName: string | null;
  correlationState: CorrelationState;
}

export interface RequestLifecycleTimelineInput {
  request: Pick<
    ChangeRequestSummary,
    | 'requestId'
    | 'requestNumber'
    | 'title'
    | 'requesterDisplayName'
    | 'status'
    | 'submittedAt'
  >;
  approvals: RequestApprovalView[];
  execution: RequestExecutionView | null;
}

export interface RequestTimelineBuildInput extends RequestLifecycleTimelineInput {
  auditTrail: AuditLogView[];
  observedEvents: ObservedEventView[];
  correlations: EventCorrelationView[];
}

export interface AuditRowLike {
  audit_log_id: number;
  event_type: string;
  actor_display_name: string | null;
  actor_username: string | null;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  message: string | null;
  event_details: JsonObject;
  created_at: Date | null;
}

export interface ObservedEventRowLike {
  observed_event_id: number;
  event_source: string;
  source_system: string;
  source_reference: string | null;
  event_id: number | null;
  event_time: Date;
  event_type: string | null;
  title: string | null;
  message: string | null;
  object_guid: string | null;
  distinguished_name: string | null;
  sam_account_name: string | null;
  subject_account_name: string | null;
  payload: JsonObject;
  created_at: Date;
}

export interface CorrelationTimelineLike {
  correlation_id: number;
  correlated_at: Date | string;
  note: string | null;
}

export interface RequestStatusLike {
  requestType: RequestType;
  status: RequestStatus;
}

export type TimelineItemBuilder = (
  input: RequestTimelineBuildInput,
) => RequestTimelineItem[];
