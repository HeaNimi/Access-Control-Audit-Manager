<script setup lang="ts">
import type { ChangeRequestDetail } from "@acam-ts/contracts";

import {
  buildTargetSummary,
  formatDateTime,
  requestTypeLabel,
  stateBadge,
} from "../utils/request-helpers";

defineProps<{
  detail: ChangeRequestDetail;
}>();
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <UPageCard title="Workflow state" variant="subtle">
      <div class="space-y-3">
        <UBadge v-bind="stateBadge(detail.status)" class="capitalize">
          {{ stateBadge(detail.status).label }}
        </UBadge>
        <div class="space-y-1">
          <div class="text-xs font-medium uppercase tracking-wide text-muted">
            Correlation
          </div>
          <UBadge v-bind="stateBadge(detail.correlationState)" class="capitalize">
            {{ stateBadge(detail.correlationState).label }}
          </UBadge>
        </div>
      </div>
    </UPageCard>

    <UPageCard title="Requester" variant="subtle">
      <div class="space-y-1">
        <div class="font-medium text-highlighted">
          {{ detail.requester.displayName }}
        </div>
        <div class="font-mono text-xs text-muted">
          {{ detail.requester.username }}
        </div>
      </div>
    </UPageCard>

    <UPageCard title="Target" variant="subtle">
      <div class="space-y-1">
        <div class="text-sm text-highlighted">
          {{ buildTargetSummary(detail.payload) }}
        </div>
        <div class="text-xs text-muted">
          Submitted {{ formatDateTime(detail.submittedAt) }}
        </div>
      </div>
    </UPageCard>

    <UPageCard title="Request type" variant="subtle">
      <div class="font-medium text-highlighted">
        {{ requestTypeLabel(detail.requestType) }}
      </div>
    </UPageCard>
  </div>
</template>
