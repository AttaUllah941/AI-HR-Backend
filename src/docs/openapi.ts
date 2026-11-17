import type { Router } from 'express';
import { z } from 'zod';
import { getRouteMeta } from './route-meta.js';

type JsonObject = Record<string, unknown>;

interface ExpressLayer {
  handle: unknown;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

export interface OpenApiOptions {
  title: string;
  version: string;
  /** Base URL clients call, e.g. `/api/v1`. */
  serverUrl: string;
  description?: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Zod -> JSON Schema. Transforms/preprocess (e.g. "" -> undefined) are described by their input. */
function toJsonSchema(schema: z.ZodType): JsonObject {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as JsonObject;
  delete json['$schema'];
  return json;
}

function expressPathToOpenApi(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(path: string): JsonObject[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function queryParameters(schema: z.ZodType): JsonObject[] {
  const json = toJsonSchema(schema);
  const properties = (json['properties'] ?? {}) as Record<string, JsonObject>;
  const required = new Set((json['required'] as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

/** Names of the handlers that matter for documentation, in registration order. */
function describeStack(handlers: Array<{ handle: unknown }>) {
  const permissions: string[] = [];
  let body: z.ZodType | undefined;
  let query: z.ZodType | undefined;
  let auth = false;
  for (const { handle } of handlers) {
    const meta = getRouteMeta(handle);
    if (!meta) continue;
    if (meta.auth) auth = true;
    if (meta.permissions) permissions.push(...meta.permissions);
    if (meta.schema?.kind === 'body') body = meta.schema.zod;
    if (meta.schema?.kind === 'query') query = meta.schema.zod;
  }
  return { permissions, body, query, auth };
}

const errorResponse = (description: string): JsonObject => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

/**
 * Builds an OpenAPI 3.1 document from the mounted Express routers. Request bodies and query
 * parameters come from the Zod validators attached by validateBody / validateQuery; security and
 * permissions come from authMiddleware / requirePermissions. Responses use the shared envelope.
 */
export function buildOpenApiSpec(
  mounts: ReadonlyArray<readonly [string, Router]>,
  options: OpenApiOptions,
): JsonObject {
  const paths: Record<string, JsonObject> = {};
  const tags = new Set<string>();

  for (const [prefix, router] of mounts) {
    const tag = prefix.replace(/^\//, '').split('/')[0] || 'root';
    tags.add(tag);

    // Router-level `router.use(authMiddleware)` secures every route registered after it.
    let secured = false;
    for (const layer of (router as unknown as { stack: ExpressLayer[] }).stack) {
      if (!layer.route) {
        if (getRouteMeta(layer.handle)?.auth) secured = true;
        continue;
      }

      const routePath = layer.route.path === '/' ? '' : layer.route.path;
      const fullPath = expressPathToOpenApi(`${prefix}${routePath}`);
      const { permissions, body, query, auth } = describeStack(layer.route.stack);
      const needsAuth = secured || auth;

      for (const method of HTTP_METHODS) {
        if (!layer.route.methods[method]) continue;

        const parameters = [...pathParameters(layer.route.path), ...(query ? queryParameters(query) : [])];
        const operation: JsonObject = {
          tags: [tag],
          summary: `${method.toUpperCase()} ${fullPath}`,
          operationId: `${method}_${fullPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
          ...(parameters.length ? { parameters } : {}),
          ...(body
            ? {
                requestBody: {
                  required: true,
                  content: { 'application/json': { schema: toJsonSchema(body) } },
                },
              }
            : {}),
          ...(needsAuth ? { security: [{ bearerAuth: [] }] } : {}),
          ...(permissions.length ? { 'x-required-permissions': permissions } : {}),
          responses: {
            '200': {
              description: 'Success',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } },
            },
            '400': errorResponse('Validation failed'),
            ...(needsAuth ? { '401': errorResponse('Missing or invalid token') } : {}),
            ...(permissions.length ? { '403': errorResponse('Missing permission') } : {}),
            '404': errorResponse('Not found'),
          },
        };

        (paths[fullPath] ??= {})[method] = operation;
      }
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version,
      description:
        options.description ??
        'Generated from the Express routers and Zod validators. Responses use the envelope { success, data | message, code }. List endpoints accept page/pageSize (max 100); audit logs, attendance records and notifications also accept ?cursor= for keyset pagination.',
    },
    servers: [{ url: options.serverUrl }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiSuccess: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean', const: true },
            data: {},
            message: { type: 'string' },
          },
        },
        ApiError: {
          type: 'object',
          required: ['success', 'message'],
          properties: {
            success: { type: 'boolean', const: false },
            message: { type: 'string' },
            code: { type: 'string' },
            errors: {},
          },
        },
        OffsetPagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer', maximum: 100 },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        CursorPagination: {
          type: 'object',
          properties: {
            mode: { type: 'string', const: 'cursor' },
            pageSize: { type: 'integer', maximum: 100 },
            hasMore: { type: 'boolean' },
            nextCursor: { type: ['string', 'null'] },
          },
        },
      },
    },
  };
}
