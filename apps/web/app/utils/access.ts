import type { RoleCode } from "@acam-ts/contracts";

export interface NavigationItem {
  to: string;
  label: string;
  caption: string;
  allowedRoles?: RoleCode[];
  children?: NavigationItem[];
}

export const navigationItems: NavigationItem[] = [
  {
    to: "/requests",
    label: "Requests",
    caption: "Workflow",
  },
  {
    to: "/requests/new",
    label: "New Request",
    caption: "Submit",
  },
  {
    to: "/observed-events",
    label: "Observed Events",
    caption: "Ingested",
    allowedRoles: ["approver", "auditor", "administrator"],
  },
  {
    to: "/audit",
    label: "Audit",
    caption: "Ledger",
    allowedRoles: ["approver", "auditor", "administrator"],
  },
  {
    to: "/settings",
    label: "Settings",
    caption: "Runtime",
    allowedRoles: ["administrator"],
    children: [
      {
        to: "/settings/config",
        label: "Current config",
        caption: "Runtime",
        allowedRoles: ["administrator"],
      },
      {
        to: "/settings/logs",
        label: "Logs",
        caption: "Application",
        allowedRoles: ["administrator"],
      },
    ],
  },
];

export function canAccessRoute(
  userRoles: RoleCode[] | undefined,
  allowedRoles?: RoleCode[],
) {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  if (!userRoles || userRoles.length === 0) {
    return false;
  }

  return allowedRoles.some((role) => userRoles.includes(role));
}
