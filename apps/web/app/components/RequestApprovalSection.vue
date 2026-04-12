<script setup lang="ts">
import type { RequestApprovalView } from "@acam-ts/contracts";

import { stateBadge } from "../utils/request-helpers";

defineProps<{
  approvals: RequestApprovalView[];
  canApprove: boolean;
  actionLoading: boolean;
}>();

const emit = defineEmits<{
  decide: [decision: "approved" | "rejected"];
}>();
</script>

<template>
  <UPageCard
    title="Approval"
    description="Business decision and approver context."
    variant="subtle"
  >
    <div class="space-y-4">
      <div
        v-for="approval in approvals"
        :key="approval.approvalId"
        class="rounded-2xl border border-default bg-default/50 p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="font-medium text-highlighted">
              {{ approval.approverDisplayName }}
            </div>
            <div class="font-mono text-xs text-muted">
              {{ approval.approverUsername }}
            </div>
          </div>
          <UBadge
            v-bind="stateBadge(approval.decision ?? 'pending')"
            class="capitalize"
          >
            {{ stateBadge(approval.decision ?? "pending").label }}
          </UBadge>
        </div>
        <p class="mt-3 text-sm text-muted">
          {{ approval.decisionComment || "No decision comment." }}
        </p>
      </div>

      <div v-if="canApprove" class="flex flex-wrap gap-3">
        <UButton
          color="success"
          icon="i-lucide-badge-check"
          :loading="actionLoading"
          @click="emit('decide', 'approved')"
        >
          Approve
        </UButton>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-circle-x"
          :loading="actionLoading"
          @click="emit('decide', 'rejected')"
        >
          Reject
        </UButton>
      </div>
    </div>
  </UPageCard>
</template>
