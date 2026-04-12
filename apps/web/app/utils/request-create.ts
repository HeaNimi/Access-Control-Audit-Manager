import type {
  AccountChangeDirectorySnapshot,
  AuthenticatedUserProfile,
  DirectoryGroupMemberView,
  DirectoryGroupView,
} from "@acam-ts/contracts";

export const accountAttributeFields = [
  { key: "displayName", attribute: "displayName", label: "Display name" },
  { key: "givenName", attribute: "givenName", label: "Given name" },
  { key: "surname", attribute: "sn", label: "Surname" },
  {
    key: "userPrincipalName",
    attribute: "userPrincipalName",
    label: "User principal name",
  },
  { key: "mail", attribute: "mail", label: "Email" },
  { key: "department", attribute: "department", label: "Department" },
  { key: "title", attribute: "title", label: "Title" },
  { key: "company", attribute: "company", label: "Company" },
  {
    key: "telephoneNumber",
    attribute: "telephoneNumber",
    label: "Telephone number",
  },
] as const;

export type AccountEditableFieldKey =
  (typeof accountAttributeFields)[number]["key"];

export type AttributePreviewChange = {
  attribute: string;
  label: string;
  previousValue: string | null;
  nextValue: string | null;
};

export type AccountChangeEditableValues = Record<AccountEditableFieldKey, string> & {
  description: string;
  enabled: boolean;
  accountExpiresAt: string;
};

const passwordOnsets = [
  "b",
  "br",
  "c",
  "ch",
  "cl",
  "cr",
  "d",
  "dr",
  "f",
  "fl",
  "fr",
  "g",
  "gl",
  "gr",
  "h",
  "j",
  "k",
  "l",
  "m",
  "n",
  "p",
  "pl",
  "pr",
  "qu",
  "r",
  "s",
  "sh",
  "sk",
  "sl",
  "sm",
  "sn",
  "sp",
  "st",
  "t",
  "th",
  "tr",
  "v",
  "w",
  "z",
];

const passwordVowels = [
  "a",
  "e",
  "i",
  "o",
  "u",
  "ai",
  "ea",
  "ee",
  "oa",
  "oo",
  "ou",
  "ar",
  "er",
  "or",
];

const passwordCodas = [
  "",
  "",
  "b",
  "ck",
  "d",
  "f",
  "g",
  "k",
  "l",
  "m",
  "n",
  "p",
  "r",
  "s",
  "st",
  "t",
  "th",
];

const passwordSymbols = ["!", "#", "$", "%", "+", "?", "@", "^", "_", "~"];

function randomIndex(max: number) {
  if (max <= 0) {
    return 0;
  }

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function generateSyllable() {
  const onset = passwordOnsets[randomIndex(passwordOnsets.length)];
  const vowel = passwordVowels[randomIndex(passwordVowels.length)];
  const coda = passwordCodas[randomIndex(passwordCodas.length)];

  return `${onset}${vowel}${coda}`;
}

function generatePronounceableWord(syllableCount: number) {
  return capitalizeWord(
    Array.from({ length: syllableCount }, () => generateSyllable()).join(""),
  );
}

export function generateSimplePassword() {
  const firstWord = generatePronounceableWord(3);
  const secondWord = generatePronounceableWord(3);
  const number = `${100 + randomIndex(900)}`;
  const symbol = passwordSymbols[randomIndex(passwordSymbols.length)];

  return `${firstWord}-${secondWord}-${number}${symbol}`;
}

export function buildPendingCreationDescription(
  user: Pick<AuthenticatedUserProfile, "displayName" | "username"> | null | undefined,
  createdAt: Date,
) {
  const actorName =
    user?.displayName && user.displayName !== user.username
      ? `${user.displayName} (${user.username})`
      : (user?.username ?? "the requester");

  return `created on ${createdAt.toLocaleString()} by ${actorName} for request #pending`;
}

export function normalizeFieldValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function normalizeDateTimeInput(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function sortDirectoryGroups(groups: DirectoryGroupView[]) {
  return [...groups].sort((left, right) =>
    (
      left.displayName ??
      left.samAccountName ??
      left.distinguishedName
    ).localeCompare(
      right.displayName ?? right.samAccountName ?? right.distinguishedName,
    ),
  );
}

export function sortDirectoryMembers(members: DirectoryGroupMemberView[]) {
  return [...members].sort((left, right) =>
    (
      left.displayName ??
      left.samAccountName ??
      left.distinguishedName
    ).localeCompare(
      right.displayName ?? right.samAccountName ?? right.distinguishedName,
    ),
  );
}

function pushPreviewChange(
  changes: AttributePreviewChange[],
  input: AttributePreviewChange,
) {
  if (input.previousValue === input.nextValue) {
    return;
  }

  changes.push(input);
}

export function buildAccountAttributeChanges(
  snapshot: AccountChangeDirectorySnapshot,
  values: AccountChangeEditableValues,
): AttributePreviewChange[] {
  const changes: AttributePreviewChange[] = accountAttributeFields
    .map((field) => {
      const previousValue = normalizeFieldValue(snapshot.account[field.key]);
      const nextValue = normalizeFieldValue(values[field.key]);

      if (previousValue === nextValue) {
        return null;
      }

      return {
        attribute: field.attribute,
        label: field.label,
        previousValue,
        nextValue,
      };
    })
    .filter((change): change is AttributePreviewChange => !!change);

  pushPreviewChange(changes, {
    attribute: "description",
    label: "Description",
    previousValue: normalizeFieldValue(snapshot.account.description ?? null),
    nextValue: normalizeFieldValue(values.description),
  });

  pushPreviewChange(changes, {
    attribute: "enabled",
    label: "Enabled",
    previousValue:
      snapshot.account.enabled === null || snapshot.account.enabled === undefined
        ? null
        : String(snapshot.account.enabled),
    nextValue: String(values.enabled),
  });

  pushPreviewChange(changes, {
    attribute: "accountExpiresAt",
    label: "Account expiry",
    previousValue: snapshot.account.accountExpiresAt ?? null,
    nextValue: normalizeDateTimeInput(values.accountExpiresAt),
  });

  return changes;
}
