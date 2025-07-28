<summary>
Authentication system providing JWT token handling and account creation for both registered users and anonymous embed users. Supports two authentication types: session-based and JWT-based with encrypted secrets.
</summary>

<howToUse>
The auth module provides two main functions: JWT token handling and account creation. Use JWT functions for embed authentication and account creation functions to build Account objects with helper methods.

```typescript
import { encodeLightdashJwt, decodeLightdashJwt } from './lightdashJwt';
import { fromSession, fromJwt } from './account';

// Create JWT for embed dashboard
const token = encodeLightdashJwt(
    {
        content: { dashboardUuid: 'dash-123' },
        user: { email: 'user@example.com' },
    },
    encryptedSecret,
    '1h',
);

// Decode and validate JWT
const decodedToken = decodeLightdashJwt(token, encryptedSecret);

// Create account from session user
const sessionAccount = fromSession(sessionUser, 'web-app');

// Create anonymous account from JWT
const anonymousAccount = fromJwt({
    decodedToken,
    organization,
    source: token,
    dashboardUuid: 'dash-123',
    userAttributes,
});
```

</howToUse>

<codeExample>

```typescript
// Example: Create embed token for dashboard
const embedJwt = encodeLightdashJwt(
    {
        content: {
            dashboardUuid: dashboard.uuid,
            dashboardFiltersInteractivity: 'enabled',
        },
        user: {
            email: 'embed-user@client.com',
            externalId: 'client-user-123',
        },
    },
    organization.jwtSecret,
    '24h',
);

// Example: Validate and create anonymous account
try {
    const decodedToken = decodeLightdashJwt(embedToken, organization.jwtSecret);
    const account = fromJwt({
        decodedToken,
        organization: { organizationUuid: org.uuid, name: org.name },
        source: embedToken,
        dashboardUuid: dashboard.uuid,
        userAttributes: { attributes: [] },
    });

    // Use account helper methods
    if (account.isAnonymousUser()) {
        console.log('Anonymous embed user');
    }
} catch (error) {
    // Handle token validation errors
}
```

</codeExample>

<importantToKnow>
- JWT secrets must be encrypted using EncryptionUtil before storage/use
- The `decodeLightdashJwt` function logs schema validation errors but doesn't fail for backward compatibility
- Account helper methods include `isAuthenticated()`, `isRegisteredUser()`, `isAnonymousUser()`, `isSessionUser()`, `isJwtUser()`
- Anonymous accounts are created for JWT-based embed users with external IDs
- Session accounts are for registered users authenticated via session cookies
- All accounts require ability rules for CASL-based authorization
- Token expiration and invalid tokens throw appropriate ForbiddenError/ParameterError
</importantToKnow>

<links>
@/packages/backend/src/utils/EncryptionUtil/EncryptionUtil.ts - Encryption utilities for JWT secrets
@/packages/common/src/types/account.ts - Account type definitions
@/packages/common/src/authorization/ability.ts - CASL ability definitions
</links>
