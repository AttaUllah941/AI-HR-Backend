import { Router } from 'express';
import { env } from '../config/env.js';
import { API_MOUNTS } from '../routes/index.js';
import { buildOpenApiSpec } from './openapi.js';

/**
 * Interactive API docs. Only mounted outside production (see app.ts), so the route map is not
 * published on a live deployment.
 *
 *   GET /api/docs               Swagger UI
 *   GET /api/docs/openapi.json  the OpenAPI 3.1 document
 */
export const docsRouter = Router();

let cached: ReturnType<typeof buildOpenApiSpec> | null = null;

docsRouter.get('/openapi.json', (_req, res) => {
  cached ??= buildOpenApiSpec(API_MOUNTS, {
    title: 'Zenith HR API',
    version: '1.0.0',
    serverUrl: env.API_PREFIX,
  });
  res.json(cached);
});

docsRouter.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Zenith HR API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: 'openapi.json', dom_id: '#swagger-ui', persistAuthorization: true });
    </script>
  </body>
</html>`);
});
