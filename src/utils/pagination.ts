export type PaginationParams = {
  page?: unknown;
  pageSize?: unknown;
};

export type ParsePaginationOptions = {
  defaultPageSize?: number;
  maxPageSize?: number;
};

export function parsePagination(
  params: PaginationParams | Record<string, unknown>,
  options: ParsePaginationOptions = {},
) {
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(params.pageSize) || defaultPageSize));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}
