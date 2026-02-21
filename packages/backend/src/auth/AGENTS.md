<summary>
Authentication module that handles both session-based authentication for registered users and JWT-based authentication for embedded dashboards. Provides a unified Account interface with appropriate permissions and access controls for each authentication type.
</summary>

<howToUse>
The auth module exports two main functions for creating accounts:

```typescript
import { fromSession, fromJwt } from '@lightdash/backend/src/auth/account';

// For registered users with session authentication
const sessionAccount = fromSession(sessionUser);

// For anonymous users with JWT authentication (embedded dashboards and charts)
const jwtAccount = fromJwt({
    decodedToken, // Decoded JWT payload
    organization, // Organization details
    contentUuid, // Content being accessed—either dashboard or chart
    contentType, // 'dashboard' | 'chart'
    userAttributes, // Optional user attributes for filtering
});
```

For JWT token handling:

```typescript
import {
    encodeLightdashJwt,
    decodeLightdashJwt,
} from '@lightdash/backend/src/auth/lightdashJwt';

// Encode a JWT token
const token = await encodeLightdashJwt(
    jwtData, // CreateEmbedJwt payload
    encryptedSecret, // Encrypted JWT secret
    expiresIn, // Token expiration (e.g., '1h', '7d')
);

// Decode and validate a JWT token
const decoded = await decodeLightdashJwt(token, encryptedSecret);
```

All accounts include helper methods for type checking:

```typescript
if (account.isSessionUser()) {
    // Handle registered user logic
}

if (account.isJwtUser()) {
    // Handle embedded dashboard logic
}
```

</howToUse>

<codeExample>
```typescript
// Example: Creating an account from an Express request with session
async function handleAuthenticatedRequest(req: Request) {
  const sessionUser = req.user; // From session middleware
  const account = fromSession(sessionUser);
  
  // Use account for authorization checks
  if (account.ability.can('view', 'Dashboard')) {
    // User has permission
  }
}

// Example: Handling embedded dashboard with JWT
async function handleEmbeddedDashboard(jwtToken: string, encryptedSecret: string) {
try {
const decoded = await decodeLightdashJwt(jwtToken, encryptedSecret);

    const account = fromJwt({
      decoded,
      organization: { organizationUuid: decoded.organizationUuid, name: 'Org Name' },
      contentUuid: decoded.dashboardUuid,
      contentType: 'dashboard',
      userAttributes: getUserAttributesFromSomewhere(),
    });

    // Account will have restricted access to only the specified dashboard
    return account;

} catch (error) {
// Handle JWT errors (expired, invalid, etc.)
}
}

```
</codeExample>

<links>
- Account types and interfaces: @packages/common/src/types/auth.ts
- Permission handling: @packages/common/src/authorization/index.ts
- Account helper functions: @packages/common/src/authorization/buildAccountHelpers.ts
</links>

<importantToKnow>
- JWT accounts are always considered "anonymous" even if they have user attributes
- JWT accounts get a generated external user ID prefixed with "external::"
- JWT tokens should be validated with the Zod schema but validation errors are logged, not thrown
- Session accounts derive permissions from the database user, while JWT accounts get permissions from the token payload
- The auth module uses CASL for permission management - abilities are attached to all account objects
</importantToKnow>
```
