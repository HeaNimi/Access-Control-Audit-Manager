import type { ChangeRequestPayload, RequestType } from "./requests";

export interface DirectoryExecutionContext {
  requestId: string;
  requestNumber: number;
  requestType: RequestType;
  payload: ChangeRequestPayload;
}

export interface DirectoryExecutionResult {
  success: boolean;
  message: string;
  changedDn?: string;
  changedAttributes?: string[];
  raw?: Record<string, unknown>;
}

export interface DirectoryExecutor {
  execute(
    context: DirectoryExecutionContext,
  ): Promise<DirectoryExecutionResult>;
}
