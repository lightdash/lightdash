# MCP OAuth Credential Resolution

This document captures the backend credential resolution flow for MCP usage and the OAuth connection flow for user-scoped and shared credentials.

Compatibility rule for older clients:

- If `credentialScope` is omitted on OAuth connect flows, default it to `user`.

## Prompt execution flow

```mermaid
flowchart TD
    A[User sends prompt] --> B[Agent selects MCP tool]
    B --> C[Load MCP server from DB]
    C --> D{Auth method}

    D -->|none| N1[No credential needed]
    N1 --> Z[Execute MCP call]

    D -->|bearer| B1[Load bearer secret from MCP server record]
    B1 --> B2{Bearer secret exists?}
    B2 -->|yes| B3[Attach bearer token]
    B3 --> Z
    B2 -->|no| E1[Return not connected / auth error]

    D -->|oauth| O1{Sharing enabled on MCP server?}
    O1 -->|no| O2[Look up user-scoped OAuth credential]
    O2 --> O3{User credential exists and is valid?}
    O3 -->|yes| O4[Use user credential]
    O4 --> Z
    O3 -->|no| E2[Return authorization required]

    O1 -->|yes| O5[Look up user-scoped OAuth credential first]
    O5 --> O6{User credential exists and is valid?}
    O6 -->|yes| O7[Use user credential]
    O7 --> Z
    O6 -->|no| O8[Look up shared OAuth credential]
    O8 --> O9{Shared credential exists and is valid?}
    O9 -->|yes| O10[Use shared credential]
    O10 --> Z
    O9 -->|no| E3[Return authorization required]
```

## OAuth creation and login flow

```mermaid
flowchart TD
    A[User starts OAuth flow or creates MCP] --> B{Action type}

    B -->|create/update MCP server| C[Save MCP config]
    C --> D{Auth method}

    D -->|none| C1[Store no credential config]
    C1 --> END1[MCP saved]

    D -->|bearer| C2[Store bearer secret on MCP server]
    C2 --> END1

    D -->|oauth| C3[Store OAuth MCP server config]
    C3 --> C4[Persist allow_oauth_credential_sharing flag]
    C4 --> END1

    B -->|connect OAuth credential| O1[Read request credentialScope]
    O1 --> O2{credentialScope provided?}
    O2 -->|no older client| O3[Default credentialScope = user]
    O2 -->|yes| O4[Use provided scope]

    O3 --> O5
    O4 --> O5{Scope value}

    O5 -->|user| U1[Start user-scoped OAuth flow]
    U1 --> U2[Store state tied to actor and MCP server]
    U2 --> U3[OAuth callback exchanges code]
    U3 --> U4[Persist credential on user row or user-scoped credential record]
    U4 --> END2[User credential connected]

    O5 -->|shared| S1{Sharing enabled on MCP server?}
    S1 -->|no| E1[Reject request]
    S1 -->|yes| S2{Actor is manager?}
    S2 -->|no| E2[Reject request]
    S2 -->|yes| S3[Start shared OAuth flow]
    S3 --> S4[Store state tied to shared scope and MCP server]
    S4 --> S5[OAuth callback exchanges code]
    S5 --> S6[Persist shared credential]
    S6 --> END3[Shared credential connected]
```
