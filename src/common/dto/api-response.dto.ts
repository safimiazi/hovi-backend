/**
 * Standard API response wrapper for successful responses.
 */
export class ApiResponseDto<T> {
  success: boolean;
  data: T;

  constructor(data: T) {
    this.success = true;
    this.data = data;
  }
}

/**
 * Paginated response wrapper including pagination metadata.
 */
export class PaginatedResponseDto<T> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };

  constructor(data: T[], page: number, limit: number, totalCount: number) {
    this.success = true;
    this.data = data;
    this.meta = {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
