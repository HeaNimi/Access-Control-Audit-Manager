<script setup lang="ts">
import { toErrorMessage } from "../utils/errors";

const { token, user, ensureHydrated, ensureSession, login } = useAuth();
const toast = useToast();

ensureHydrated();

const username = ref("");
const password = ref("");
const submitting = ref(false);
const checkingExistingSession = ref(false);

async function resolveExistingSession() {
  if (!token.value) {
    return;
  }

  checkingExistingSession.value = true;

  try {
    await ensureSession();

    if (user.value) {
      await navigateTo("/requests");
    }
  } catch {
    // Keep the sign-in form visible if the session cannot be revalidated yet.
  } finally {
    checkingExistingSession.value = false;
  }
}

async function signIn() {
  submitting.value = true;

  try {
    await login(username.value, password.value);
    await navigateTo("/requests");
  } catch (caught) {
    toast.add({
      description: toErrorMessage(caught, "Login failed."),
      color: "error",
      icon: "i-lucide-circle-alert",
    });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void resolveExistingSession();
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-10">
    <UCard class="w-full max-w-xl">
      <template #header>
        <div class="space-y-2">
          <h1 class="text-2xl font-semibold text-highlighted">Sign in</h1>
          <p class="text-sm leading-6 text-muted">
            Use your Windows sAMAccountName and password to access the internal
            tool. The local_admin account exists only for local recovery.
          </p>
        </div>
      </template>

      <div class="space-y-5">
        <UAlert
          v-if="checkingExistingSession"
          color="neutral"
          variant="soft"
          icon="i-lucide-loader-circle"
          description="Checking your existing session…"
        />

        <UFormField label="Windows sAMAccountName" size="lg">
          <UInput
            v-model="username"
            autocomplete="username"
            placeholder="testuser1"
            icon="i-lucide-user-round"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Password" size="lg">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            icon="i-lucide-key-round"
            class="w-full"
            @keyup.enter="signIn"
          />
        </UFormField>
      </div>

      <template #footer>
        <UButton
          size="lg"
          icon="i-lucide-log-in"
          :loading="submitting"
          class="w-full justify-center"
          @click="signIn"
        >
          {{ submitting ? "Signing in…" : "Sign in" }}
        </UButton>
      </template>
    </UCard>
  </div>
</template>
