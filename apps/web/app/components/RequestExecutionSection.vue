<script setup lang="ts">
import type { RequestExecutionView } from "@acam-ts/contracts";

import { formatDateTime, stateBadge } from "../utils/request-helpers";

const props = withDefaults(
  defineProps<{
    execution: RequestExecutionView | null;
    canRetry?: boolean;
    retryLoading?: boolean;
  }>(),
  {
    canRetry: false,
    retryLoading: false,
  },
);

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <UPageCard
    title="Execution"
    description="Automatic directory execution and structured diagnostics."
    variant="subtle"
  >
    <div v-if="props.execution" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UBadge
          v-bind="stateBadge(props.execution.executionStatus)"
          class="capitalize"
        >
          {{ stateBadge(props.execution.executionStatus).label }}
        </UBadge>
        <div class="flex flex-wrap items-center gap-3">
          <div class="text-xs text-muted">
            Started {{ formatDateTime(props.execution.startedAt) }}
          </div>
          <UButton
            v-if="props.canRetry"
            color="warning"
            variant="soft"
            icon="i-lucide-rotate-ccw"
            :loading="props.retryLoading"
            @click="emit('retry')"
          >
            Retry execution
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="props.canRetry"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        description="Retry reruns the directory execution. If the previous attempt made partial AD changes, the next attempt can fail on already-applied steps."
      />

      <div class="grid gap-3 md:grid-cols-2">
        <UPageCard title="Started" variant="soft">
          {{ formatDateTime(props.execution.startedAt) }}
        </UPageCard>
        <UPageCard title="Finished" variant="soft">
          {{
            props.execution.finishedAt
              ? formatDateTime(props.execution.finishedAt)
              : "Waiting"
          }}
        </UPageCard>
      </div>

      <UAlert
        v-if="props.execution.errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="props.execution.errorMessage"
      />

      <CollapsibleSection
        title="Execution details"
        description="Structured execution diagnostics and LDAP step results."
      >
        <pre class="json-block">{{
          JSON.stringify(props.execution.executionResult, null, 2)
        }}</pre>
      </CollapsibleSection>
    </div>

    <UAlert
      v-else
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      description="Execution has not started yet."
    />
  </UPageCard>
</template>
