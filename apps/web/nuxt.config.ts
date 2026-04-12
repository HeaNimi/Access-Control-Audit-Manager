// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  buildDir: ".nuxt",
  modules: ["@nuxt/ui"],
  devtools: { enabled: true },
  colorMode: {
    preference: "dark",
    fallback: "dark",
    classSuffix: "",
  },
  vite: {
    optimizeDeps: {
      include: ["@vue/devtools-core", "@vue/devtools-kit"],
    },
  },
  ssr: false,
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiBaseUrl:
        process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
      defaultUpnSuffix:
        process.env.NUXT_PUBLIC_DEFAULT_UPN_SUFFIX ??
        process.env.LDAP_UPN_SUFFIX ??
        "example.local",
      defaultMailDomain:
        process.env.NUXT_PUBLIC_DEFAULT_MAIL_DOMAIN ??
        process.env.NUXT_PUBLIC_DEFAULT_UPN_SUFFIX ??
        process.env.LDAP_UPN_SUFFIX ??
        "example.local",
    },
  },
});
