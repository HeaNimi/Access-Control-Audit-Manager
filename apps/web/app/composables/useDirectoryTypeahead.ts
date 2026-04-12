import { onScopeDispose, reactive, watch, type Ref } from "vue";
import { toErrorMessage } from "../utils/errors";

interface UseDirectoryTypeaheadOptions {
  minimumLength?: number;
  delayMs?: number;
  shouldSkip?: (trimmedQuery: string) => boolean;
  fallbackError?: string;
}

export function useDirectoryTypeahead<T>(
  query: Ref<string>,
  search: (query: string) => Promise<T[]>,
  options: UseDirectoryTypeaheadOptions = {},
) {
  const minimumLength = options.minimumLength ?? 2;
  const delayMs = options.delayMs ?? 275;

  const state = reactive({
    loading: false,
    error: null as string | null,
    results: [] as T[],
  });

  let timer: ReturnType<typeof setTimeout> | null = null;

  async function runSearch(requestQuery: string) {
    try {
      const results = await search(requestQuery);

      if (query.value.trim() === requestQuery) {
        state.results = results;
      }
    } catch (caught) {
      if (query.value.trim() === requestQuery) {
        state.results = [];
        state.error = toErrorMessage(
          caught,
          options.fallbackError ?? "Search failed.",
        );
      }
    } finally {
      if (query.value.trim() === requestQuery) {
        state.loading = false;
      }
    }
  }

  function reset() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    state.loading = false;
    state.error = null;
    state.results = [];
  }

  function trigger() {
    if (timer) {
      clearTimeout(timer);
    }

    const trimmedQuery = query.value.trim();
    state.error = null;

    if (
      !trimmedQuery ||
      trimmedQuery.length < minimumLength ||
      options.shouldSkip?.(trimmedQuery)
    ) {
      state.loading = false;
      state.results = [];
      return;
    }

    state.loading = true;
    timer = setTimeout(() => {
      void runSearch(trimmedQuery);
    }, delayMs);
  }

  watch(query, trigger);
  onScopeDispose(reset);

  return Object.assign(state, {
    reset,
    trigger,
  });
}
