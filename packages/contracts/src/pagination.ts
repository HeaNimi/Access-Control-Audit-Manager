export interface PaginatedEntriesView<T> {
  entries: T[];
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
