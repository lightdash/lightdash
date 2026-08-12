---
paths:
  - packages/common/src/types/projects.ts
  - packages/warehouses/**
---

# Warehouse Credentials Protection

**CRITICAL**: When adding new credential fields to warehouse configurations, always check if they contain sensitive data that should NOT be exposed via API responses.

**Location**: `packages/common/src/types/projects.ts`

The `sensitiveCredentialsFieldNames` array (in the file above) controls which fields are stripped from API responses.

**When adding new warehouse authentication methods:**

1. **Identify sensitive fields**: Any field containing passwords, tokens, keys, secrets, or identifiers that could be used for authentication
2. **Add to sensitiveCredentialsFieldNames**: This ensures the field is stripped via `Omit<CreateXxxCredentials, SensitiveCredentialsFieldNames>`
3. **Test API responses**: Verify the sensitive data doesn't appear in GET /api/v1/projects/{uuid} responses
4. **Examples of sensitive fields**:
    - OAuth client secrets (equivalent to passwords)
    - Refresh tokens (can be used to obtain access tokens)
    - Access tokens (direct authentication)
    - Private keys, certificates
    - Database passwords
    - Personal access tokens
5. **Examples of potentially sensitive fields** (use judgment):
    - OAuth client IDs (less sensitive but best practice to hide)
    - Usernames (often considered PII)

**How it works**:

-   `CreateXxxCredentials` types contain ALL fields including sensitive ones (used for creation/updates)
-   `XxxCredentials` types are `Omit<CreateXxxCredentials, SensitiveCredentialsFieldNames>` (used for API responses)
-   `ProjectModel.get()` filters credentials using this array before returning to API controllers
-   `ProjectModel.getWithSensitiveFields()` returns unfiltered data for internal use only
