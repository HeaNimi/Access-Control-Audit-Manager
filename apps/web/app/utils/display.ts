export function presentValue(
  value: string | null | undefined,
  fallback = "Not set",
) {
  return value && value.trim().length > 0 ? value : fallback;
}

export function presentEnabledState(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "Not set";
  }

  return value ? "Enabled" : "Disabled";
}

export function presentDateTimeValue(
  value: string | null | undefined,
  fallback = "Not set",
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleString();
}

export function presentExpiryValue(value: string | null | undefined) {
  return presentDateTimeValue(value, "Does not expire");
}

export function presentChangeValue(
  attribute: string,
  value: string | null | undefined,
) {
  if (attribute === "enabled") {
    if (value === null || value === undefined) {
      return "Not set";
    }

    return value === "true" ? "Enabled" : "Disabled";
  }

  if (attribute === "accountExpiresAt") {
    return presentExpiryValue(value);
  }

  return presentValue(value);
}
