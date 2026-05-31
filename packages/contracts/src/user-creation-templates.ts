import type { DirectoryObjectRef } from "./directory";

export interface UserCreationTemplateReference {
  templateId: string;
  templateName?: string;
  templateVersion?: number;
}

export interface UserCreationTemplateGroupInput extends DirectoryObjectRef {
  distinguishedName: string;
  sortOrder?: number;
}

export interface UserCreationTemplateGroupView extends UserCreationTemplateGroupInput {
  sortOrder: number;
}

export interface UserCreationTemplateInput {
  templateName: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  ouDistinguishedName?: string | null;
  enabledDefault?: boolean | null;
  accountExpiresOffsetDays?: number | null;
  descriptionTemplate?: string | null;
  upnSuffix?: string | null;
  mailDomain?: string | null;
  groups?: UserCreationTemplateGroupInput[];
}

export interface UserCreationTemplateSummary {
  templateId: string;
  templateName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  templateVersion: number;
  ouDistinguishedName: string | null;
  enabledDefault: boolean | null;
  accountExpiresOffsetDays: number | null;
  descriptionTemplate: string | null;
  upnSuffix: string | null;
  mailDomain: string | null;
  groupCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreationTemplateView extends UserCreationTemplateSummary {
  groups: UserCreationTemplateGroupView[];
}
