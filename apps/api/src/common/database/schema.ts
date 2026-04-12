import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely';

export type JsonObject = Record<string, unknown>;

export interface SystemUserTable {
  user_id: Generated<string>;
  username: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  ad_object_guid: string | null;
  ad_object_sid: string | null;
  distinguished_name: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RoleTable {
  role_id: Generated<number>;
  role_code: string;
  description: string;
}

export interface UserRoleTable {
  user_id: string;
  role_id: number;
}

export interface ChangeRequestTable {
  request_id: Generated<string>;
  request_number: Generated<number>;
  request_type: string;
  status: string;
  title: string;
  justification: string;
  requester_user_id: string;
  target_object_type: string | null;
  target_object_guid: string | null;
  target_object_sid: string | null;
  target_distinguished_name: string | null;
  target_sam_account_name: string | null;
  target_display_name: string | null;
  request_data: ColumnType<
    JsonObject,
    JsonObject | string,
    JsonObject | string
  >;
  submitted_at: Generated<Date>;
  approved_at: Date | null;
  executed_at: Date | null;
  closed_at: Date | null;
}

export interface RequestApprovalTable {
  approval_id: Generated<string>;
  request_id: string;
  approver_user_id: string;
  approval_step: number;
  is_required: boolean;
  decision: string | null;
  decision_comment: string | null;
  decided_at: Date | null;
  created_at: Generated<Date>;
}

export interface RequestExecutionTable {
  execution_id: Generated<string>;
  request_id: string;
  execution_status: string;
  started_at: Date;
  finished_at: Date | null;
  execution_result: ColumnType<
    JsonObject,
    JsonObject | string,
    JsonObject | string
  >;
  error_message: string | null;
  created_at: Generated<Date>;
}

export interface AuditLogTable {
  audit_log_id: Generated<number>;
  request_id: string | null;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_role: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  message: string | null;
  event_details: ColumnType<
    JsonObject,
    JsonObject | string,
    JsonObject | string
  >;
  created_at: Generated<Date>;
}

export interface ObservedEventTable {
  observed_event_id: Generated<number>;
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
  payload: ColumnType<JsonObject, JsonObject | string, JsonObject | string>;
  created_at: Generated<Date>;
}

export interface EventCorrelationTable {
  correlation_id: Generated<number>;
  request_id: string;
  audit_log_id: number | null;
  observed_event_id: number | null;
  note: string | null;
  correlated_at: Generated<Date>;
}

export interface SiemSourceCheckpointTable {
  source_key: string;
  driver_key: string;
  enabled: boolean;
  last_event_time: Date | null;
  last_sort: ColumnType<
    JsonObject | null,
    JsonObject | string | null,
    JsonObject | string | null
  >;
  last_source_reference: string | null;
  last_success_at: Date | null;
  last_error_at: Date | null;
  last_error_message: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DatabaseSchema {
  system_user: SystemUserTable;
  role: RoleTable;
  user_role: UserRoleTable;
  change_request: ChangeRequestTable;
  request_approval: RequestApprovalTable;
  request_execution: RequestExecutionTable;
  audit_log: AuditLogTable;
  observed_event: ObservedEventTable;
  event_correlation: EventCorrelationTable;
  siem_source_checkpoint: SiemSourceCheckpointTable;
}

export type SystemUserRow = Selectable<SystemUserTable>;
export type ChangeRequestRow = Selectable<ChangeRequestTable>;
export type RequestApprovalRow = Selectable<RequestApprovalTable>;
export type RequestExecutionRow = Selectable<RequestExecutionTable>;
export type AuditLogRow = Selectable<AuditLogTable>;
export type ObservedEventRow = Selectable<ObservedEventTable>;
export type EventCorrelationRow = Selectable<EventCorrelationTable>;
export type SiemSourceCheckpointRow = Selectable<SiemSourceCheckpointTable>;

export type NewSystemUser = Insertable<SystemUserTable>;
export type NewChangeRequest = Insertable<ChangeRequestTable>;
export type NewRequestApproval = Insertable<RequestApprovalTable>;
export type NewRequestExecution = Insertable<RequestExecutionTable>;
export type NewAuditLog = Insertable<AuditLogTable>;
export type NewObservedEvent = Insertable<ObservedEventTable>;
export type NewEventCorrelation = Insertable<EventCorrelationTable>;
export type NewSiemSourceCheckpoint = Insertable<SiemSourceCheckpointTable>;

export type ChangeRequestUpdate = Updateable<ChangeRequestTable>;
export type RequestApprovalUpdate = Updateable<RequestApprovalTable>;
export type RequestExecutionUpdate = Updateable<RequestExecutionTable>;
export type SiemSourceCheckpointUpdate = Updateable<SiemSourceCheckpointTable>;
