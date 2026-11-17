import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_MOUNTS } from '../routes/index.js';
import { buildOpenApiSpec } from './openapi.js';

type Operation = {
  tags: string[];
  security?: unknown[];
  parameters?: Array<{ name: string; in: string; required: boolean; schema: Record<string, unknown> }>;
  requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown> } } } };
  'x-required-permissions'?: string[];
  responses: Record<string, unknown>;
};
type Spec = {
  openapi: string;
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
};

const spec = buildOpenApiSpec(API_MOUNTS, {
  title: 'Zenith HR API',
  version: '1.0.0',
  serverUrl: '/api/v1',
}) as unknown as Spec;

describe('OpenAPI document generated from the routers', () => {
  it('is an OpenAPI 3.1 document with the API prefix as server', () => {
    assert.equal(spec.openapi, '3.1.0');
    assert.equal(spec.servers[0].url, '/api/v1');
    assert.ok(spec.components.securitySchemes['bearerAuth']);
  });

  it('documents every mounted router (hundreds of operations, not a hand-picked few)', () => {
    const operations = Object.values(spec.paths).flatMap((methods) => Object.keys(methods));
    assert.ok(operations.length > 150, `only ${operations.length} operations`);
    const tags = new Set(Object.values(spec.paths).flatMap((m) => Object.values(m).flatMap((o) => o.tags)));
    for (const expected of ['auth', 'employees', 'leave', 'payroll', 'recruitment', 'notifications']) {
      assert.ok(tags.has(expected), `missing tag ${expected}`);
    }
  });

  it('converts Express path params and lists them', () => {
    const op = spec.paths['/employees/{id}']?.get;
    assert.ok(op, 'GET /employees/{id}');
    assert.deepEqual(
      op.parameters?.filter((p) => p.in === 'path').map((p) => p.name),
      ['id'],
    );
  });

  it('takes request bodies from the Zod validators', () => {
    const op = spec.paths['/payroll/runs']?.post;
    assert.ok(op?.requestBody, 'POST /payroll/runs has a request body');
    const props = op.requestBody.content['application/json'].schema.properties ?? {};
    assert.ok('year' in props && 'month' in props, 'year and month come from createPayrollRunSchema');
  });

  it('documents pagination: pageSize is capped at 100 and cursor is offered where supported', () => {
    const list = spec.paths['/notifications']?.get;
    assert.ok(list, 'GET /notifications');
    const byName = Object.fromEntries((list.parameters ?? []).map((p) => [p.name, p]));
    assert.ok(byName['cursor'], 'cursor query parameter');
    assert.equal(byName['pageSize']?.schema['maximum'], 100);
    assert.equal(byName['page']?.schema['minimum'], 1);
  });

  it('marks protected routes with bearer auth and required permissions', () => {
    const op = spec.paths['/payroll/runs']?.post;
    assert.deepEqual(op?.security, [{ bearerAuth: [] }]);
    assert.deepEqual(op?.['x-required-permissions'], ['payroll:create']);
    assert.ok(op?.responses['401'] && op.responses['403']);
  });

  it('leaves public routes without security', () => {
    const login = spec.paths['/auth/login']?.post;
    assert.ok(login, 'POST /auth/login');
    assert.equal(login.security, undefined);
    assert.equal(spec.paths['/health/live']?.get?.security, undefined);
  });
});
