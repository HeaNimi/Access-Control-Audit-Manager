<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["administrator"],
});

await navigateTo("/settings/config", { replace: true });
</script>

<template>
  <div />
</template>
