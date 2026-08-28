export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: unknown;
  code?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(data: T, message = 'Success'): ApiSuccessResponse<T> {
  return { success: true, data, message };
}

export function errorResponse(
  message: string,
  options?: { errors?: unknown; code?: string },
): ApiErrorResponse {
  return {
    success: false,
    message,
    errors: options?.errors,
    code: options?.code,
  };
}
