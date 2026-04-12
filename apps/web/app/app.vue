<template>
  <UApp>
    <div class="relative min-h-screen overflow-hidden">
      <PageBloom />
      <div class="relative z-10 min-h-screen">
        <NuxtRouteAnnouncer />
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </div>
    </div>
  </UApp>
</template>
