# Authentication Controller Module

<summary>
Provides authentication strategies, middleware, and utilities for Lightdash's multi-provider authentication system. Supports password-based login, OAuth providers (Google, Azure, OIDC, etc.), and API key authentication using Passport.js with session-based storage.
</summary>

<howToUse>
The module exports authentication strategies, middleware functions, and utilities that work together:

**Authentication Middleware:**

```typescript
import { isAuthenticated, allowApiKeyAuthentication } from './authentication';

// Require session-based authentication
app.get('/protected-route', isAuthenticated, handler);

// Allow both session and API key authentication
app.get('/api-route', allowApiKeyAuthentication, handler);
```

**Authentication Strategies:**

```typescript
import {
    localPassportStrategy,
    googlePassportStrategy,
} from './authentication';

// Register strategies with passport
passport.use('local', localPassportStrategy({ userService }));
passport.use('google', googlePassportStrategy);
```

**OAuth Flow Helpers:**

```typescript
import { storeOIDCRedirect, getOidcRedirectURL } from './authentication';

// Store redirect info before OAuth
app.get(
    '/oauth/google/login',
    storeOIDCRedirect,
    passport.authenticate('google'),
);

// Get redirect URL after OAuth
app.get('/oauth/google/callback', (req, res) => {
    const redirectUrl = getOidcRedirectURL(true)(req);
    res.redirect(redirectUrl);
});
```

</howToUse>

<codeExample>

```typescript
// Complete authentication setup
import passport from 'passport';
import {
    localPassportStrategy,
    googlePassportStrategy,
    apiKeyPassportStrategy,
    isAuthenticated,
    allowApiKeyAuthentication,
} from './authentication';

// Register all strategies
passport.use('local', localPassportStrategy({ userService }));
passport.use('google', googlePassportStrategy);
passport.use('headerapikey', apiKeyPassportStrategy({ userService }));

// Session-only routes
app.post('/login', passport.authenticate('local'), (req, res) => {
    res.json({ user: req.user });
});

// API routes supporting both session and API keys
app.get('/api/v1/user', allowApiKeyAuthentication, (req, res) => {
    res.json(req.user);
});

// OAuth login with redirect handling
app.get(
    '/oauth/google/login',
    storeOIDCRedirect,
    passport.authenticate('google', { scope: ['profile', 'email'] }),
);
```

</codeExample>

<importantToKnow>
**Authentication Flow:**
1. Session cookies contain encrypted session IDs
2. express-session looks up session data in PostgreSQL
3. Passport deserializes user from session data to `req.user`

**Authentication Middleware — Chain Order:**

`allowApiKeyAuthentication` tries authentication methods in this order (first match wins):
1. **Session cookie** — via `req.isAuthenticated()` (Passport session)
2. **OAuth bearer token** — validates against the internal OAuth2 server (`@node-oauth/oauth2-server`)
3. **Service account bearer token** — enterprise feature for CI/CD
4. **Personal access token (PAT)** — via `ApiKey` header, can be disabled via config

`allowOauthAuthentication` is a restricted variant that only allows session or OAuth bearer tokens (no PAT, no service account). Used for endpoints where PAT auth should be excluded, e.g. creating a PAT from an OAuth token.

**API Key Authentication:**

- Supports both service accounts (Bearer tokens) and Personal Access Tokens (ApiKey header)
- OAuth bearer tokens are checked first, then service accounts, then PATs
- PATs can be disabled via configuration

**OAuth Server (Lightdash as OAuth provider):**

- Lightdash acts as an OAuth 2.0 authorization server for MCP clients and external integrations
- Endpoints are in `oauthRouter.ts` under `/api/v1/oauth/`
- Supports authorization code flow with optional PKCE
- `/oauth/register` is unauthenticated per RFC 7591 (dynamic client registration for MCP)
- `/oauth/introspect` deviates from RFC 7662 — requires a user session instead of client credentials (intentionally more restrictive)

**OAuth Login (external providers):**

- Redirects are validated against site URL for security
- PKCE and state parameters used for OAuth flows
- Popup mode supported for embedded authentication

**Critical Constraints:**

- Deactivated users have sessions destroyed automatically
- Demo mode blocks certain operations via `unauthorisedInDemo`
- Invalid users are redirected to login or invite links
- OAuth redirects must match the configured site URL host
  </importantToKnow>

<links>
Main entry point: @/packages/backend/src/controllers/authentication/index.ts
Middleware functions: @/packages/backend/src/controllers/authentication/middlewares.ts
Strategy implementations: @/packages/backend/src/controllers/authentication/strategies/
User service: @/packages/backend/src/services/UserService.ts
</links>
