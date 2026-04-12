export type TypeaheadOption = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

export type KeyValueItem = {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  colSpanClass?: string;
};
