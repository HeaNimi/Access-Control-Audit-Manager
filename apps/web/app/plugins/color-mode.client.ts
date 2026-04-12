export default defineNuxtPlugin(() => {
  const colorMode = useColorMode();

  if (import.meta.client) {
    localStorage.setItem("nuxt-color-mode", "dark");
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }

  colorMode.preference = "dark";
  colorMode.value = "dark";
});
