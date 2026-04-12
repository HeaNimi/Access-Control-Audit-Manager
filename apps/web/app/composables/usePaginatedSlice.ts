import { computed, unref, watch, type Ref } from "vue";

export function usePaginatedSlice<T>(
  items: Ref<T[]>,
  page: Ref<number>,
  pageSize: number | Ref<number>,
) {
  const total = computed(() => items.value.length);
  const pages = computed(() =>
    Math.max(1, Math.ceil(total.value / Math.max(1, unref(pageSize)))),
  );

  const slice = computed(() => {
    const size = Math.max(1, unref(pageSize));
    const currentPage = Math.min(Math.max(1, page.value), pages.value);
    const start = (currentPage - 1) * size;

    return items.value.slice(start, start + size);
  });

  watch(
    [total, pages],
    () => {
      if (page.value < 1) {
        page.value = 1;
        return;
      }

      if (page.value > pages.value) {
        page.value = pages.value;
      }
    },
    { immediate: true },
  );

  return {
    total,
    pages,
    slice,
  };
}
