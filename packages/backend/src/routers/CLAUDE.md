# Backend API Routers Module

<summary>
Express.js routers that define the REST API endpoints for the Lightdash backend. Each router handles a specific domain (projects, users, dashboards, etc.) and implements authentication, authorization, and request handling patterns. All routers are mounted under the `/api/v1` prefix.

Most routers are deprecated, since we have migrated to using controllers in TSOA.

</summary>

<howToUse>
Routers are automatically registered in the main API router (@/apiV1Router.ts) and follow consistent patterns:

1. Import authentication middleware
2. Define route handlers with appropriate middleware stack
3. Call service layer methods via `req.services`
4. Return standardized JSON responses with `{ status: 'ok', results: data }`

Each router exports a configured Express router that can be mounted on specific paths.
</howToUse>

<codeExample>

```typescript
// Basic router structure
import express from 'express';
import {
    isAuthenticated,
    allowApiKeyAuthentication,
} from '../controllers/authentication';

export const myRouter = express.Router({ mergeParams: true });

// GET endpoint with authentication
myRouter.get(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getMyService()
            .getAllItems(req.user!)
            .then((results) => res.json({ status: 'ok', results }))
            .catch(next);
    },
);

// POST endpoint with demo protection
myRouter.post(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getMyService()
            .createItem(req.user!, req.body)
            .then((results) => res.json({ status: 'ok', results }))
            .catch(next);
    },
);

// Router mounting in apiV1Router.ts
apiV1Router.use('/my-resource', myRouter);
```

</codeExample>

<importantToKnow>
**Most endpoints are build in controllers**: We normally build endpoints in controllers using TSOA. Endpoints built in controllers are either old and we didn't migrate them to controllers, or they require an special integration with raw express parameters, like oauthRouter.ts

**Authentication Middleware**: All routers use consistent middleware patterns:

- `isAuthenticated`: Requires valid session or API key
- `allowApiKeyAuthentication`: Enables OAuth + API key + service account auth (tries OAuth bearer first, then service account, then PAT)
- `allowOauthAuthentication`: Restricted variant — only session or OAuth bearer (no PAT, no service account)
- `unauthorisedInDemo`: Blocks write operations in demo environments

**Service Layer Access**: Routers access business logic via `req.services` dependency injection container. Never implement business logic directly in routers.

**Response Format**: All successful responses follow `{ status: 'ok', results: data }` format. Errors are handled by Express error middleware.

**Route Parameters**: Project-scoped routers use `{ mergeParams: true }` to access parent route params like `:projectUuid`.

**OAuth implementation**: `oauthRouter.ts` implements Lightdash as an OAuth 2.0 authorization server for MCP clients and external integrations. Key endpoints:
- `/oauth/authorize` — authorization code flow (requires user session)
- `/oauth/token` — token exchange (unauthenticated, per spec)
- `/oauth/register` — dynamic client registration (unauthenticated, RFC 7591, needed for MCP)
- `/oauth/introspect` — token introspection (requires user session, intentionally deviates from RFC 7662)
- `/oauth/revoke` — token revocation (unauthenticated, per RFC 7009)
- `/oauth/userinfo` — OpenID Connect user info (requires auth)
- `/oauth/clients` — admin CRUD for OAuth clients (requires org admin)
- `/.well-known/oauth-authorization-server` — OAuth2 discovery metadata

**API Versioning**: All routes are under `/api/v1` prefix. Future versions would create new router modules.
</importantToKnow>

<links>
- Main API router: @/apiV1Router.ts
- Authentication controllers: @/../controllers/authentication/
- Service layer: @/../services/
- Models: @/../models/
- Express app setup: @/../app.ts
- OAuth implementation: @/oauthRouter.ts
- New controllers: @/../controllers
</links>
