import { Injectable } from '@nestjs/common';

import {
  getTargetSummary,
  type AuditLogView,
  type ChangeRequestSummary,
  type CorrelationState,
  type EventCorrelationView,
  type ObservedEventView,
  type RequestTimelineItem,
  type RequestType,
} from '@acam-ts/contracts';

import type {
  AuditRowLike,
  CorrelationTimelineLike,
  ObservedEventRowLike,
  RequestLifecycleTimelineInput,
  RequestSummaryBuildInput,
  RequestTimelineBuildInput,
} from './read-model.types';

@Injectable()
export class ReadModelService {
  buildChangeRequestSummary(
    input: RequestSummaryBuildInput,
  ): ChangeRequestSummary {
    return {
      requestId: input.request.request_id,
      requestNumber: input.request.request_number,
      requestType: input.request.request_type as RequestType,
      status: input.request.status as ChangeRequestSummary['status'],
      title: input.request.title,
      justification: input.request.justification,
      requesterDisplayName: input.requesterDisplayName,
      approverDisplayName: input.approverDisplayName ?? null,
      targetSummary: getTargetSummary(input.payload),
      correlationState: input.correlationState,
      submittedAt: input.request.submitted_at.toISOString(),
      approvedAt: input.request.approved_at?.toISOString() ?? null,
      executedAt: input.request.executed_at?.toISOString() ?? null,
    };
  }

  buildRequestLifecycleTimeline(
    input: RequestLifecycleTimelineInput,
  ): RequestTimelineItem[] {
    const items: RequestTimelineItem[] = [
      {
        id: `request-${input.request.requestId}`,
        kind: 'request_submitted',
        timestamp: input.request.submittedAt,
        title: `Request #${input.request.requestNumber} submitted`,
        message: input.request.title,
        actor: input.request.requesterDisplayName,
        status: input.request.status,
      },
      ...input.approvals
        .filter((approval) => approval.decision)
        .map((approval) => ({
          id: `approval-${approval.approvalId}`,
          kind: 'approval_decided' as const,
          timestamp: approval.decidedAt ?? approval.createdAt,
          title:
            approval.decision === 'approved'
              ? 'Request approved'
              : 'Request rejected',
          message: approval.decisionComment ?? undefined,
          actor: approval.approverDisplayName,
          status: approval.decision ?? undefined,
        })),
    ];

    if (input.execution) {
      items.push({
        id: `execution-start-${input.execution.executionId}`,
        kind: 'execution_started',
        timestamp: input.execution.startedAt,
        title: 'Automatic execution started',
        status: input.execution.executionStatus,
      });

      if (input.execution.finishedAt) {
        items.push({
          id: `execution-finish-${input.execution.executionId}`,
          kind: 'execution_finished',
          timestamp: input.execution.finishedAt,
          title: 'Automatic execution finished',
          message: input.execution.errorMessage ?? undefined,
          status: input.execution.executionStatus,
        });
      }
    }

    return items;
  }

  buildAuditTimelineItems(auditTrail: AuditLogView[]): RequestTimelineItem[] {
    return auditTrail.map((audit) => ({
      id: `audit-${audit.auditLogId}`,
      kind: 'audit_log',
      timestamp: audit.createdAt,
      title: audit.eventType,
      message: audit.message ?? undefined,
      actor: audit.actorDisplayName ?? audit.actorUsername ?? undefined,
      status: audit.actorRole,
      meta: audit.eventDetails,
    }));
  }

  buildObservedEventTimelineItems(
    observedEvents: ObservedEventView[],
  ): RequestTimelineItem[] {
    return observedEvents.map((event) => ({
      id: `observed-${event.observedEventId}`,
      kind: 'observed_event',
      timestamp: event.eventTime,
      title: event.title ?? event.eventType ?? 'Observed event',
      message: event.message ?? undefined,
      status: event.correlationState,
      meta: {
        eventId: event.eventId,
        sourceSystem: event.sourceSystem,
      },
    }));
  }

  buildCorrelationTimelineItems(
    correlations: Array<EventCorrelationView | CorrelationTimelineLike>,
  ): RequestTimelineItem[] {
    return correlations.map((correlation) => ({
      id: `correlation-${
        'correlationId' in correlation
          ? correlation.correlationId
          : correlation.correlation_id
      }`,
      kind: 'correlation',
      timestamp:
        'correlatedAt' in correlation
          ? correlation.correlatedAt
          : correlation.correlated_at instanceof Date
            ? correlation.correlated_at.toISOString()
            : correlation.correlated_at,
      title: 'Correlation created',
      message: correlation.note ?? undefined,
    }));
  }

  buildRequestTimeline(
    input: RequestTimelineBuildInput,
  ): RequestTimelineItem[] {
    return this.sortTimelineItems([
      ...this.buildRequestLifecycleTimeline(input),
      ...this.buildAuditTimelineItems(input.auditTrail),
      ...this.buildObservedEventTimelineItems(input.observedEvents),
      ...this.buildCorrelationTimelineItems(input.correlations),
    ]);
  }

  sortTimelineItems(items: RequestTimelineItem[]): RequestTimelineItem[] {
    return [...items].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    );
  }

  mapAuditRow(row: AuditRowLike): AuditLogView {
    return {
      auditLogId: row.audit_log_id,
      eventType: row.event_type,
      actorDisplayName: row.actor_display_name,
      actorUsername: row.actor_username,
      actorRole: row.actor_role,
      entityType: row.entity_type,
      entityId: row.entity_id,
      message: row.message,
      eventDetails: row.event_details,
      createdAt: row.created_at?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  mapObservedEventRow(
    row: ObservedEventRowLike,
    correlationState: CorrelationState,
  ): ObservedEventView {
    return {
      observedEventId: row.observed_event_id,
      eventSource: row.event_source,
      sourceSystem: row.source_system,
      sourceReference: row.source_reference,
      eventId: row.event_id,
      eventTime: row.event_time.toISOString(),
      eventType: row.event_type,
      title: row.title,
      message: row.message,
      objectGuid: row.object_guid,
      distinguishedName: row.distinguished_name,
      samAccountName: row.sam_account_name,
      subjectAccountName: row.subject_account_name,
      payload: row.payload,
      createdAt: row.created_at.toISOString(),
      correlationState,
      matchedRequest: null,
    };
  }
}
