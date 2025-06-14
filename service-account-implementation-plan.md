# Lightdash Authentication System: Implementation Guide

This guide outlines the implementation plan for upgrading Lightdash's authentication system to support OAuth 2.0 as a provider and introduce an actor-based permission model.

It's a biggy ok? We want to make it easy to review. Reviewing auth changes are scary and often complex. Let's make the changes as simple as possible and keep it easy for other devs to review ok?


NOTE THE CODE EXAMPLES ARE PSEUDO CODE - THEY WERE NOT GENERATED WITH KNOWLEDGE OF THIS CODE BASE
YOU WILL NEED TO ADAPT THE CHANGES TO THE CURRENT LIGHTDASH CODE BASE

Important guidelines:
- Any secrets written to the database must use the EncryptionService if they need to be decoded or hashing if they don't need to be decoded
- In db migrations. Don't use varchar just always use text. Remeber to add indices where needed.

## Core Architecture Changes

### 1. Actor Model Implementation

Create a new abstraction layer that represents authentication as an "actor" rather than directly as a user:

```typescript
// src/models/actor.ts
export enum ActorType {
  USER = 'user',
  SERVICE_ACCOUNT = 'service_account',
}

export interface Actor {
  id: string;
  type: ActorType;
  organizationId: string;
  scopes: string[];
  
  // User-specific properties
  userId?: string;
  
  // Service account specific properties
  serviceAccountId?: string;
  serviceAccountName?: string;
}
```

### 2. Database Schema Updates

#### Create Service Accounts Table

```sql
CREATE TABLE service_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_uuid UUID NOT NULL REFERENCES organizations(organization_uuid),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_user_uuid UUID REFERENCES users(user_uuid),
  client_id VARCHAR(64) UNIQUE NOT NULL,
  client_secret VARCHAR(128) NOT NULL,
  auth_strategy VARCHAR(50) NOT NULL DEFAULT 'simple_bearer',
  scopes JSONB NOT NULL,
  redirect_uris TEXT[] DEFAULT '{}',
  allowed_grant_types VARCHAR(50)[] DEFAULT '{"client_credentials", "authorization_code", "refresh_token"}',
  token_lifetime INTEGER, -- For simple bearer tokens
  access_token_lifetime INTEGER, -- For OAuth access tokens
  refresh_token_lifetime INTEGER, -- For OAuth refresh tokens
  refresh_token_rotation VARCHAR(20), -- 'static' or 'rotating'
  public_keys JSONB -- For JWT auth
);

CREATE INDEX idx_service_accounts_organization ON service_accounts(organization_uuid);
CREATE INDEX idx_service_accounts_client_id ON service_accounts(client_id);
```

#### Create OAuth Tokens Table

```sql
CREATE TABLE oauth_tokens (
  access_token VARCHAR(255) PRIMARY KEY,
  refresh_token VARCHAR(255) UNIQUE,
  client_id VARCHAR(64) NOT NULL REFERENCES service_accounts(client_id),
  scopes JSONB NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_oauth_tokens_client_id ON oauth_tokens(client_id);
CREATE INDEX idx_oauth_tokens_refresh_token ON oauth_tokens(refresh_token);
```

#### Update Resources Tables for Actor Model

For each resource table with a created_by field, add a created_by_type column:

```sql
-- Example for charts table
ALTER TABLE charts 
  ADD COLUMN created_by_type VARCHAR(50) NOT NULL DEFAULT 'user';

-- Example for dashboards table
ALTER TABLE dashboards 
  ADD COLUMN created_by_type VARCHAR(50) NOT NULL DEFAULT 'user';

-- Similarly for other resources...
```

### 3. Authentication Middleware Updates

Modify the authentication middleware to support the actor model:

```typescript
// src/middleware/authentication.ts

async function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Check for Bearer token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Check if it's an OAuth token
      const oauthTokenData = await validateOAuthToken(token);
      if (oauthTokenData) {
        const serviceAccount = await getServiceAccountByClientId(oauthTokenData.clientId);
        req.actor = {
          id: serviceAccount.id,
          type: ActorType.SERVICE_ACCOUNT,
          organizationId: serviceAccount.organization_uuid,
          scopes: oauthTokenData.scopes,
          serviceAccountId: serviceAccount.id,
          serviceAccountName: serviceAccount.name
        };
        
        // For backward compatibility
        req.user = null;
        
        return next();
      }
      
      // Check if it's a personal access token
      const patData = await validatePersonalAccessToken(token);
      if (patData) {
        const user = await getUserById(patData.user_uuid);
        req.actor = {
          id: user.user_uuid,
          type: ActorType.USER,
          organizationId: user.organization_uuid,
          userId: user.user_uuid,
          scopes: getUserScopes(user)
        };
        
        // For backward compatibility
        req.user = user;
        
        return next();
      }
    }
    
    // Check for session cookie
    const sessionUser = await getSessionUser(req);
    if (sessionUser) {
      req.actor = {
        id: sessionUser.user_uuid,
        type: ActorType.USER,
        organizationId: sessionUser.organization_uuid,
        userId: sessionUser.user_uuid,
        scopes: getUserScopes(sessionUser)
      };
      
      // For backward compatibility
      req.user = sessionUser;
      
      return next();
    }
    
    // No authentication found
    return res.status(401).json({ error: 'Unauthorized' });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

### 4. OAuth 2.0 Endpoints Implementation

Create new routes for OAuth flows:

```typescript
// src/routers/oauth.ts
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes, createHash } from 'crypto';

const router = Router();

// Authorization endpoint
router.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri, state, response_type, scope } = req.query;
  
  // Validate request
  if (!client_id || !redirect_uri || response_type !== 'code') {
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  // Validate client and redirect URI
  const serviceAccount = await validateClientAndRedirectUri(client_id as string, redirect_uri as string);
  if (!serviceAccount) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  
  // Create authorization code
  const authCode = await generateAuthorizationCode(serviceAccount.id, (scope as string || '').split(' '));
  
  // Redirect back to client
  return res.redirect(`${redirect_uri}?code=${authCode}&state=${state || ''}`);
});

// Token endpoint
router.post('/token', async (req, res) => {
  const { grant_type, code, refresh_token, client_id, client_secret } = req.body;
  
  // Validate client credentials
  const serviceAccount = await authenticateClient(client_id, client_secret);
  if (!serviceAccount) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  try {
    let tokens;
    
    if (grant_type === 'authorization_code') {
      // Validate authorization code
      const authCodeData = await validateAuthCode(code, client_id);
      if (!authCodeData) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      // Generate tokens
      tokens = await generateTokens(serviceAccount, authCodeData.scopes);
    } else if (grant_type === 'refresh_token') {
      // Validate refresh token
      const refreshTokenData = await validateRefreshToken(refresh_token, client_id);
      if (!refreshTokenData) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      // Generate new tokens
      tokens = await refreshAccessToken(serviceAccount, refreshTokenData);
    } else if (grant_type === 'client_credentials') {
      // Generate tokens directly from client credentials
      tokens = await generateTokensFromClientCredentials(serviceAccount);
    } else {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    
    return res.json(tokens);
  } catch (error) {
    console.error('Token endpoint error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Token revocation endpoint
router.post('/revoke', async (req, res) => {
  const { token, token_type_hint } = req.body;
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  // Extract client credentials from Basic auth
  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [clientId, clientSecret] = credentials.split(':');
  
  // Validate client
  const serviceAccount = await authenticateClient(clientId, clientSecret);
  if (!serviceAccount) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  // Revoke the token
  await revokeToken(token, token_type_hint, clientId);
  
  return res.status(200).send();
});

export default router;
```

### 5. Token Service Implementation

```typescript
// src/services/tokenService.ts

import { randomBytes, createHash } from 'crypto';
import { db } from '../database/connection';

// Generate secure random token
function generateToken(length = 32) {
  return randomBytes(length).toString('hex');
}

// Generate OAuth tokens
async function generateTokens(serviceAccount, scopes) {
  const accessToken = generateToken();
  const refreshToken = generateToken(48);
  
  const accessTokenLifetime = serviceAccount.access_token_lifetime || 3600; // 1 hour default
  const refreshTokenLifetime = serviceAccount.refresh_token_lifetime || 2592000; // 30 days default
  
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + accessTokenLifetime);
  
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setSeconds(refreshExpiresAt.getSeconds() + refreshTokenLifetime);
  
  await db('oauth_tokens').insert({
    access_token: accessToken,
    refresh_token: refreshToken,
    client_id: serviceAccount.client_id,
    scopes: JSON.stringify(scopes),
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt
  });
  
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenLifetime,
    refresh_token: refreshToken,
    scope: Array.isArray(scopes) ? scopes.join(' ') : scopes
  };
}

// Validate OAuth token
async function validateOAuthToken(token) {
  const tokenData = await db('oauth_tokens')
    .where({
      access_token: token,
      is_revoked: false
    })
    .first();
  
  if (!tokenData) {
    return null;
  }
  
  // Check if token is expired
  if (new Date() > new Date(tokenData.expires_at)) {
    return null;
  }
  
  // Update last used timestamp
  await db('oauth_tokens')
    .where({ access_token: token })
    .update({ last_used_at: new Date() });
  
  return {
    clientId: tokenData.client_id,
    scopes: JSON.parse(tokenData.scopes)
  };
}

// Additional token service functions...

export {
  generateTokens,
  validateOAuthToken,
  // Export other functions...
};
```

### 6. Service Account Management

Implement service account CRUD operations:

```typescript
// src/services/serviceAccountService.ts

import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

async function createServiceAccount({
  name,
  description,
  organizationId,
  createdByUserId,
  scopes,
  authStrategy = 'simple_bearer',
  redirectUris = [],
  tokenLifetime = 31536000, // 1 year default for simple bearer
  accessTokenLifetime = 3600, // 1 hour default
  refreshTokenLifetime = 2592000, // 30 days default
  refreshTokenRotation = 'static'
}) {
  const clientId = `sa_${randomBytes(16).toString('hex')}`;
  const clientSecret = randomBytes(32).toString('hex');
  
  const [serviceAccount] = await db('service_accounts').insert({
    organization_uuid: organizationId,
    name,
    description,
    created_by_user_uuid: createdByUserId,
    client_id: clientId,
    client_secret: clientSecret,
    auth_strategy: authStrategy,
    scopes: JSON.stringify(scopes),
    redirect_uris: JSON.stringify(redirectUris),
    token_lifetime: tokenLifetime,
    access_token_lifetime: accessTokenLifetime,
    refresh_token_lifetime: refreshTokenLifetime,
    refresh_token_rotation: refreshTokenRotation
  }).returning('*');
  
  return serviceAccount;
}

// Other service account management functions...

export {
  createServiceAccount,
  // Export other functions...
};
```

### 7. Update Resource Controllers

Update resource controllers to handle both user and service account actors:

```typescript
// Example for charts controller
// src/controllers/chartsController.ts

async function createChart(req, res) {
  try {
    const { name, query, visualization_type } = req.body;
    
    // Get the actor from the request
    const actor = req.actor;
    
    // Create chart with actor information
    const [chart] = await db('charts').insert({
      name,
      query,
      visualization_type,
      created_by: actor.userId || actor.serviceAccountId, // Use the appropriate ID
      created_by_type: actor.type, // 'user' or 'service_account'
      organization_uuid: actor.organizationId
    }).returning('*');
    
    return res.json(chart);
  } catch (error) {
    console.error('Create chart error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Other chart controller functions...
```

### 8. API Routes Integration

Update your Express app to include the new OAuth routes:

```typescript
// src/app.ts
import express from 'express';
import oauthRouter from './routers/oauth';

const app = express();

// Other middleware...

// Add OAuth routes
app.use('/api/v1/oauth', oauthRouter);

// Other routes...

export default app;
```

## Implementation Phases

### Phase 1: Database Schema Updates

1. Add service_accounts table
2. Add oauth_tokens table
3. Add created_by_type to resource tables
4. Backfill existing records with created_by_type = 'user'

### Phase 2: Core Authentication Changes

1. Implement Actor model
2. Update authentication middleware
3. Implement token service functions

### Phase 3: OAuth Provider Implementation

1. Create OAuth endpoints (authorize, token, revoke)
2. Implement token generation and validation
3. Connect to authentication middleware

### Phase 4: Service Account Management

1. Implement service account CRUD API
2. Update resource controllers for actor model
3. Add API endpoints for service account management

### Phase 5: UI Updates

1. Add service account management UI
2. Add created-by display for service accounts
3. Update token management UI

## Testing Strategy

1. Unit tests for token generation and validation
2. Integration tests for OAuth flows
3. End-to-end tests for service account operations
4. Compatibility tests with existing API clients

## Migration Considerations

1. Keep backward compatibility with existing clients
2. Document API changes for client developers
3. Phase out older authentication methods gradually