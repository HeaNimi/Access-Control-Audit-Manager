<script setup lang="ts">
import type { AuditLogView, ObservedEventView } from "@acam-ts/contracts";

import { formatDateTime } from "../utils/request-helpers";

defineProps<{
  auditEntry: AuditLogView | null;
  observedEvent: ObservedEventView | null;
}>();

const emit = defineEmits<{
  closeAudit: [];
  closeObserved: [];
}>();
</script>

<template>
  <JsonDetailsDrawer
    :open="!!auditEntry"
    title="Audit entry"
    :subtitle="
      auditEntry
        ? `${auditEntry.eventType} · ${formatDateTime(auditEntry.createdAt)}`
        : undefined
    "
    :sections="
      auditEntry
        ? [
            {
              label: 'Summary',
              value: {
                auditLogId: auditEntry.auditLogId,
                eventType: auditEntry.eventType,
                actor:
                  auditEntry.actorDisplayName ||
                  auditEntry.actorUsername ||
                  auditEntry.actorRole,
                entityType: auditEntry.entityType,
                entityId: auditEntry.entityId,
                message: auditEntry.message,
                createdAt: auditEntry.createdAt,
              },
            },
            {
              label: 'Event details',
              value: auditEntry.eventDetails,
            },
          ]
        : []
    "
    @close="emit('closeAudit')"
  />

  <JsonDetailsDrawer
    :open="!!observedEvent"
    title="Observed event"
    :subtitle="
      observedEvent
        ? `${observedEvent.eventType || observedEvent.title || 'Observed event'} · ${formatDateTime(observedEvent.eventTime)}`
        : undefined
    "
    :sections="
      observedEvent
        ? [
            {
              label: 'Summary',
              value: {
                observedEventId: observedEvent.observedEventId,
                sourceSystem: observedEvent.sourceSystem,
                eventSource: observedEvent.eventSource,
                sourceReference: observedEvent.sourceReference,
                eventId: observedEvent.eventId,
                eventType: observedEvent.eventType,
                title: observedEvent.title,
                message: observedEvent.message,
                objectGuid: observedEvent.objectGuid,
                distinguishedName: observedEvent.distinguishedName,
                samAccountName: observedEvent.samAccountName,
                subjectAccountName: observedEvent.subjectAccountName,
                correlationState: observedEvent.correlationState,
                matchedRequest: observedEvent.matchedRequest,
              },
            },
            {
              label: 'Payload',
              value: observedEvent.payload,
            },
          ]
        : []
    "
    @close="emit('closeObserved')"
  />
</template>
