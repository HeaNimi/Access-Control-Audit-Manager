<script setup lang="ts">
const { token, user, ensureHydrated, ensureSession } = useAuth();

ensureHydrated();

onMounted(async () => {
  if (token.value) {
    try {
      await ensureSession();
    } catch {
      // Fall back to the stored session state on transient API failures.
    }
  }

  await navigateTo(token.value && user.value ? "/requests" : "/login");
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-10">
    <UCard class="w-full max-w-md">
      <div class="text-sm text-muted">Redirecting…</div>
    </UCard>
  </div>
</template>
