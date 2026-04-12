export interface DirectoryRefLike {
  objectGuid?: string | null;
  objectSid?: string | null;
  distinguishedName?: string | null;
  samAccountName?: string | null;
  displayName?: string | null;
}

export function valueMatches(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function matchesDirectoryRef(
  left: DirectoryRefLike,
  right: DirectoryRefLike,
): boolean {
  return (
    valueMatches(left.objectGuid, right.objectGuid) ||
    valueMatches(left.objectSid, right.objectSid) ||
    valueMatches(left.distinguishedName, right.distinguishedName) ||
    valueMatches(left.samAccountName, right.samAccountName) ||
    valueMatches(left.displayName, right.displayName)
  );
}

export function getDirectoryRefIdentifier(
  reference: DirectoryRefLike,
  fallback: string,
): string {
  return (
    reference.objectGuid ??
    reference.objectSid ??
    reference.distinguishedName?.trim().toLowerCase() ??
    reference.samAccountName?.trim().toLowerCase() ??
    reference.displayName?.trim().toLowerCase() ??
    fallback
  );
}

export function buildDirectorySignalKey(
  operation: 'add' | 'remove',
  reference: DirectoryRefLike,
  fallback: string,
): string {
  return `${operation}:${getDirectoryRefIdentifier(reference, fallback)}`;
}
