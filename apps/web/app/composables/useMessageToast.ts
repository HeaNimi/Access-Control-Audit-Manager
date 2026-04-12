import { nextTick, watch, type Ref } from "vue";

type ToastColor = "error" | "warning" | "success" | "neutral" | "primary";

type MessageToastOptions = {
  title?: string;
  color?: ToastColor;
  icon?: string;
};

export function useMessageToastController() {
  const toast = useToast();

  function showMessageToast(
    description: string | null | undefined,
    options: MessageToastOptions = {},
  ) {
    const normalizedDescription = description?.trim();

    if (!normalizedDescription) {
      return;
    }

    toast.add({
      title: options.title,
      description: normalizedDescription,
      color: options.color ?? "error",
      icon: options.icon ?? "i-lucide-circle-alert",
    });
  }

  return {
    showMessageToast,
  };
}

export function useMessageToast(
  message: Readonly<Ref<string | null | undefined>>,
  options: MessageToastOptions = {},
) {
  const { showMessageToast } = useMessageToastController();
  let lastShownMessage: string | null = null;

  watch(
    message,
    async (nextMessage) => {
      const normalizedMessage = nextMessage?.trim();

      if (!normalizedMessage) {
        lastShownMessage = null;
        return;
      }

      if (normalizedMessage === lastShownMessage) {
        return;
      }

      lastShownMessage = normalizedMessage;
      await nextTick();

      showMessageToast(normalizedMessage, options);
    },
    {
      immediate: true,
      flush: "post",
    },
  );
}
