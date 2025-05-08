# Lightdash Authentication: Developer Guide

This guide introduces Lightdash's authentication system and explains how to use the different authentication options for your integrations.

## Authentication Overview

Lightdash provides multiple ways to authenticate depending on your use case:

* **Interactive Sessions**: Browser-based login with cookies (for humans)
* **API Keys**: Simple tokens for direct API access (for scripts and tools)
* **OAuth 2.0**: Secure programmatic access with token management (for integrations)

## Understanding the Actor Model

When you authenticate with Lightdash, you're establishing an "actor" identity that will perform actions in the system. An actor can be either:

* **User Actor**: A human account with a username, email, and profile
* **Service Account Actor**: A non-human identity for automated access

Both types of actors can:
* Create and modify resources
* Access the API
* Have specific permission scopes
* Belong to an organization

## Authentication Options

### 1. Personal Access Tokens (API Keys)

**Best for**: Quick scripts, CLI tools, and personal automation

Personal Access Tokens are the simplest way to access the Lightdash API. They're tied directly to your user account and have the same permissions that you do.

```bash
# Example: Using a Personal Access Token
curl -H "Authorization: Bearer pat_1a2b3c4d5e6f7g8h9i0j" \
  https://app.lightdash.cloud/api/v1/projects
```

**Key Features**:
* Easy to generate from your profile settings
* Full access to everything your user can do
* Simple to use in scripts and tools

**Limitations**:
* No granular permission control
* Manual rotation required
* Tied to a specific user account

### 2. Service Accounts with Simple Bearer Tokens

**Best for**: Internal services, scheduled jobs, and team automation

Service accounts provide a way to create dedicated identities for automated processes. Each service account has its own identity separate from any individual user.

```bash
# Example: Using a Service Account Bearer Token
curl -H "Authorization: Bearer sa_1a2b3c4d5e6f7g8h9i0j" \
  https://app.lightdash.cloud/api/v1/projects
```

**Key Features**:
* Independent identity (not tied to a specific user)
* Configurable permission scopes
* Audit trail shows actions performed by the service account
* Simplified token management

### 3. OAuth 2.0 for Service Accounts

**Best for**: Long-running integrations, production applications, and enterprise use cases

OAuth 2.0 provides the most secure and flexible way to authenticate service accounts with Lightdash. It supports token expiration and automatic renewal.

**Key Features**:
* Short-lived access tokens with automatic renewal
* Enhanced security through token rotation
* Detailed audit logging
* Support for multiple authentication flows

#### Authentication Strategies

Service accounts can use different authentication strategies based on your security requirements:

##### a) Simple Bearer Strategy

The easiest to implement. You'll receive a single long-lived token that you include in the Authorization header.

**When to use**: Internal tools, testing, and getting started quickly

```bash
# Example: Simple Bearer Strategy
curl -H "Authorization: Bearer sa_1a2b3c4d5e6f7g8h9i0j" \
  https://app.lightdash.cloud/api/v1/projects
```

##### b) OAuth with Refresh Tokens

Provides enhanced security through short-lived access tokens and refresh tokens for renewal.

**When to use**: External integrations, production applications, and public-facing services

```javascript
// Example: OAuth Refresh Token Flow
async function getLightdashData() {
  // Check if access token is expired
  if (isTokenExpired(accessToken)) {
    // Use refresh token to get a new access token
    const response = await fetch('https://app.lightdash.cloud/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    
    const tokens = await response.json();
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token; // May be rotated
  }
  
  // Use the access token
  return fetch('https://app.lightdash.cloud/api/v1/projects', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}
```

##### c) JWT Authentication with Keys

The most secure option, using cryptographic keys instead of shared secrets.

**When to use**: High-security environments, enterprise deployments, and regulatory compliance

```javascript
// Example: JWT Authentication
import { sign } from 'jsonwebtoken';

async function getLightdashData() {
  // Generate a JWT signed with your private key
  const jwt = sign(
    { 
      iss: clientId,
      aud: 'https://app.lightdash.cloud',
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    privateKey,
    { algorithm: 'RS256' }
  );
  
  // Exchange JWT for an access token
  const response = await fetch('https://app.lightdash.cloud/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt
    })
  });
  
  const { access_token } = await response.json();
  
  // Use the access token
  return fetch('https://app.lightdash.cloud/api/v1/projects', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
}
```

## Creating and Managing Service Accounts

### Step 1: Create a Service Account

In the Lightdash UI:

1. Go to **Settings** > **Service Accounts**
2. Click **Create Service Account**
3. Enter a name and description
4. Select permission scopes
5. Choose an authentication strategy
6. Save the service account

You'll receive the client credentials (client ID and client secret) needed for authentication.

### Step 2: Configure Authentication Strategy

Depending on your chosen strategy:

* **Simple Bearer**: You'll receive a token to use directly
* **OAuth with Refresh Tokens**: Configure token lifetimes and rotation policy
* **JWT Authentication**: Upload your public key

### Step 3: Implement Authentication in Your Code

Use one of the examples above based on your chosen strategy.

## Permission Scopes

Service accounts use permission scopes to control what they can access:

* `dashboards:read` - View dashboards
* `dashboards:write` - Create and edit dashboards
* `charts:read` - View charts
* `charts:write` - Create and edit charts
* `data:read` - Access underlying data
* `data:write` - Update data sources
* `users:read` - View user information
* `users:write` - Manage users

Always follow the principle of least privilege by only granting the permissions your integration actually needs.

## Best Practices

1. **Use service accounts for automation**: Don't use personal user accounts for automated processes
2. **Grant minimal permissions**: Only give the permissions each service account needs
3. **Use the right strategy**: Choose the authentication strategy that matches your security requirements
4. **Rotate credentials regularly**: Set up a process to rotate secrets periodically
5. **Monitor usage**: Regularly review the audit logs for your service accounts

## Troubleshooting

* **401 Unauthorized**: Check that your token is valid and hasn't expired
* **403 Forbidden**: Verify that your service account has the necessary permission scopes
* **Token expired**: Implement token refresh for OAuth flows
* **Invalid redirect URI**: Ensure the redirect URI matches exactly what's registered

## Next Steps

* Explore the [API Documentation](https://docs.lightdash.com/api) for specific endpoints
* Check out our [Integration Guides](https://docs.lightdash.com/integrations) for common scenarios
* Join our [Community Slack](https://join.slack.com/t/lightdash-community/shared_invite/zt-1busg6771-EgwU~5WKKy7k1yldK9jNhg) for help from the community