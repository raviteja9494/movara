/**
 * Lightweight pagination utilities
 * Provides consistent pagination across API endpoints
 */

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Calculate pagination offset from page and limit
 * @param page 1-indexed page number
 * @param limit Items per page
 * @returns 0-indexed offset for database query
 */
export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate pagination metadata
 * @param total Total number of items
 * @param page Current page (1-indexed)
 * @param limit Items per page
 * @returns Pagination metadata
 */
export function getPaginationMetadata(
  total: number,
  page: number,
  limit: number,
): PaginationMetadata {
  const pages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    pages,
    hasNextPage: page < pages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Create paginated response
 * @param data Array of items
 * @param total Total count of all items
 * @param page Current page
 * @param limit Items per page
 * @returns Paginated response with metadata
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    pagination: getPaginationMetadata(total, page, limit),
  };
}
