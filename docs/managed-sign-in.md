# Managed sign-in (Microsoft Entra, mobile)

How the iOS and Android apps sign in to Lightdash through Microsoft Entra
directly, instead of through the in-app browser.

For browser sign-in, per-organisation Azure config and the admin panel, see
[azure-ad-sso.md](./azure-ad-sso.md). This document covers the mobile path only.

## Why it exists

A Microsoft Entra tenant can enforce a Conditional Access grant called
"require app protection policy". The policy demands that the client is an
Intune-managed application. The Lightdash apps signed in through an in-app
browser sheet, so Entra saw an unmanaged web view and blocked the sign-in. The
person could not reach Lightdash on their phone at all.

Managed sign-in removes the browser from the path. The app talks to Microsoft
through MSAL and the Microsoft Authenticator broker, which Entra recognises as
a managed client. The app then exchanges the resulting Microsoft ID token for
Lightdash OAuth tokens at the server.

## Vocabulary

| Term | Meaning |
|---|---|
| Browser sign-in | The existing path. The server talks to the identity provider. |
| Managed sign-in | The new path. The app talks to Microsoft through MSAL and the broker. |
| Web registration | The customer's confidential Entra client, used by browser sign-in. |
| Mobile registration | Lightdash's multi-tenant public Entra client, one per platform. |

## The three registrations

| Registration | Owner | Used by |
|---|---|---|
| Web | The customer | Browser sign-in, server side |
| iOS mobile | Lightdash | Managed sign-in from the iOS app |
| Android mobile | Lightdash | Managed sign-in from the Android app |

The mobile registrations are multi-tenant public clients. Each customer admin
consents once. The client ids are baked into the apps and configured on the
server.

**Entra `sub` is pairwise per client id.** The same person gets a different
`sub` from the web registration and from a mobile registration. A mobile
identity can therefore never match the `openid_identities` row that browser
sign-in stored. Managed sign-in uses the `oid` claim as its subject, which is
stable per user per tenant, and creates a second identity row for the same
user. See "User matching" below for what joins the two rows.

## Discovery

`GET /api/v1/user/login-options` takes a `mobilePlatform` query parameter,
`ios` or `android`
(`packages/backend/src/controllers/userController.ts:621`).

When the parameter is present the response can carry an extra block:

```json
{
    "provider": "microsoft",
    "clientId": "<mobile registration client id>",
    "authority": "https://login.microsoftonline.com/<tenant id>",
    "tenantId": "<tenant id>",
    "scopes": ["openid", "profile", "email"]
}
```

The block is emitted when both hold
(`packages/backend/src/services/UserService.ts:3992`):

1. The server names a Microsoft tenant for the person signing in.
2. The platform's mobile registration client id is configured.

The server names a tenant in one of two ways
(`UserService.ts:3961`):

- **Dedicated instance.** The environment Azure config sets
  `AUTH_AZURE_AD_OAUTH_TENANT_ID`. That tenant wins, and no email is needed.
- **Shared instance.** The email routes to organisations with per-organisation
  Azure SSO config. Exactly one distinct tenant id must match. Zero tenants, or
  two organisations naming different tenants, emits no block.

The block is absent when the platform parameter is missing, when the platform's
client id is not configured, when no tenant is named, or when the lookup fails.
Absence is the safe default: the app keeps browser sign-in.

`ssoPresentation` is unchanged and stays `{ kind: 'branded', provider:
'azuread' }` where it already was.

**`loginExperienceVersion` stays 1.** The shipped iOS app rejects any other
value with an "update the app" screen. A bump would lock every beta tester out
of every instance. The block is additive instead.

## The token exchange

An RFC 8693 token-exchange grant on the existing OAuth server
(`packages/backend/src/services/OAuthService/OAuthService.ts:76`).

```
POST /api/v1/oauth/token   (application/x-www-form-urlencoded)
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<Microsoft Entra ID token>
subject_token_type=urn:ietf:params:oauth:token-type:id_token
client_id=<the app's existing Lightdash OAuth client id>
scope=<the scopes the app requests today>
```

Success returns the same body as the authorisation-code grant: `access_token`,
`refresh_token`, `expires_in`, `scope`. The tokens are recorded against the
same user grant, so refresh and revocation behave identically. Mobile clients
get the longer mobile refresh lifetime, as they do for browser sign-in.

### How a client gets the grant

The grant is a server decision, not something a client asks for at
registration. `OAuth2Model.getClient` adds the token-exchange grant to any
client whose redirect URI uses the `com.lightdash.mobile:` scheme
(`packages/backend/src/models/OAuth2Model.ts:48`).

The stored `grants` column is unchanged. No migration and no client
re-registration are needed, and a self-registered client cannot grant itself
the capability. The exchange trusts the Microsoft token, not the client
identity.

### Validation order

Every step is mandatory and fails closed
(`packages/backend/src/services/OAuthService/managedSignIn/microsoftTokenVerifier.ts:186`
and `.../ManagedSignInService.ts:187`).

1. **Decode and read `tid`.** The tenant id must be a GUID before it reaches a
   URL. A malformed `tid` is rejected without any network call.
2. **Fetch the tenant's OpenID configuration and JWKS.** Discovery runs against
   `https://login.microsoftonline.com/<tid>/v2.0/.well-known/openid-configuration`.
   The document's own `issuer` must describe the same tenant. Results are cached
   with a one-hour TTL, bounded at 50 tenants.
3. **Verify the signature.** RS256 only, against that tenant's keys.
4. **`iss`** must equal `https://login.microsoftonline.com/<tid>/v2.0`.
5. **`aud`** must equal one of the configured mobile registration client ids.
   Any other audience is `token_invalid`.
6. **`exp` and `nbf`** are honoured, with five seconds of clock tolerance.
7. **`iat`** must be no older than five minutes
   (`packages/common/src/types/managedSignIn.ts:54`).
8. **Resolve the organisation from `tid` alone**, never from user input
   (`ManagedSignInService.ts:105`).
9. **Single use.** A SHA-256 hash of the token is inserted into
   `managed_sign_in_token_uses`. The insert is the claim, so two concurrent
   exchanges of one token cannot both win
   (`packages/backend/src/models/ManagedSignInModel.ts:32`).
10. **The `email` claim is required.** `preferred_username` is never used as an
    email.
11. **Resolve the user** through `UserService.loginWithOpenId`.

Steps 3 to 5 are what stop any Microsoft token from becoming a Lightdash login.
A token from a tenant the customer does not control fails step 8; a token
minted for another application fails step 5.

### Single use and pruning

`managed_sign_in_token_uses` holds one row per exchange that passed
verification. Rows carry the token's own `exp`, so they are only needed for the
token's lifetime.

No periodic job prunes expired OAuth tokens on this server, so the claim prunes
inline: before each insert it deletes up to 1000 rows whose `expires_at` has
passed, driven by the `expires_at` index
(`packages/backend/src/models/ManagedSignInModel.ts:14`). A failed prune logs a
warning and does not fail the sign-in.

A token that fails verification never reaches the claim, so a rejected token
cannot burn its own hash.

## Organisation gating

The organisation comes from `tid` and nothing else
(`ManagedSignInService.ts:105`).

| Instance | Rule | Failure |
|---|---|---|
| Dedicated | `tid` must equal `AUTH_AZURE_AD_OAUTH_TENANT_ID`. No organisation is named. | `tenant_not_configured` |
| Shared | Exactly one organisation's Azure SSO config must name that tenant and be enabled. | `tenant_not_configured` for zero or more than one |

On a shared instance the resolved organisation is then compared with the
organisation the user lands in. A mismatch is `user_not_allowed`. On a
dedicated instance there is no organisation to compare, so an organisation-less
user passes through. See "Decisions still open".

The lookup decrypts every enabled Azure row, because the stored config is
encrypted and the tenant id cannot be a SQL predicate
(`packages/backend/src/models/OrganizationSsoModel.ts:226`).

## User matching

The exchange builds an OpenID user and calls
`UserService.loginWithOpenId`, so browser sign-in and managed sign-in share one
rule set. Just-in-time creation, allowed email domains and organisation
membership follow the same rules.

| Field | Value |
|---|---|
| `issuer` | `https://login.microsoftonline.com/<tid>/v2.0` |
| `issuerType` | `azuread` |
| `subject` | the `oid` claim |
| `email` | the `email` claim |

### Identity linking

Because `sub` is pairwise, the lookup by issuer and subject misses for anyone
who already signed in through the browser. `loginWithOpenId` then finds the
existing user by email and reaches its identity-collision guard
(`packages/backend/src/services/UserService.ts:1307`).

That guard only links a new identity when OIDC linking is enabled, through
`AUTH_ENABLE_OIDC_LINKING` or the per-organisation toggle
(`UserService.ts:1023`). Linking is off by default.

**So on a default instance, the first managed sign-in fails for every user who
has already signed in on the web**, with `user_not_allowed`. Browser sign-in
never hits this branch, because it always uses the same registration. This is
open as SPK-1909 Q8.

When linking is enabled, the mobile identity is added as a second
`openid_identities` row against the same user. Later managed sign-ins match on
issuer and subject and never reach the guard again.

## Error codes

Every rejection is an OAuth `invalid_grant`. The `error_description` is exactly
one of these (`packages/common/src/types/managedSignIn.ts:45`).

| Code | Meaning | Typical cause |
|---|---|---|
| `tenant_not_configured` | The server does not serve that Microsoft tenant. | `tid` is not the configured tenant, or zero or several organisations claim it. |
| `token_invalid` | The token is not acceptable. | Bad signature, wrong issuer, wrong audience, malformed `tid`, `nbf` in the future, no mobile registration configured. |
| `token_expired` | The token is outside its time window. | `exp` has passed, or `iat` is older than five minutes. |
| `token_replayed` | The token was already exchanged. | A retry with the same token. |
| `email_unverified` | The token carries no usable email. | The `email` claim is missing. |
| `user_not_allowed` | Microsoft authenticated the person; Lightdash refused them. | Identity linking is off, the org refuses just-in-time creation, or the user's org does not match the tenant's org. |

"Consent missing" and "policy not satisfied" never reach the server. They
surface on the MSAL side before any token exists, and the apps map them from
MSAL errors.

The HTTP status keeps the token endpoint's existing mapping. Messages
containing `Invalid` or `required` answer 401; everything else answers 400
(`packages/backend/src/routers/oauthRouter.ts:332`). Managed sign-in codes are
bare words, so they answer 400.

## Log lines

A rejection writes one warning
(`.../ManagedSignInService.ts:168`):

```
Managed sign-in exchange rejected: reason=token_expired detail=iat check failed
now=1788803413 iat=1788802900 (-513s) nbf=absent exp=1788806500 (+3087s)
maxAge=300s clockTolerance=5s tid=<tenant> aud=<mobile client id>
clientId=<lightdash client id> organizationUuid=<org or undefined>
```

Every field is in the message and repeated as structured metadata. The message
carries them because the `pretty` console formatter prints only the message and
drops metadata. **The token is never logged.**

There is no dedicated success line. A successful exchange is visible as the
`loginWithOpenId` lines followed by `POST /api/v1/oauth/token 200`.

## Configuration

| Variable | Purpose |
|---|---|
| `AUTH_MICROSOFT_MANAGED_SIGNIN_IOS_CLIENT_ID` | The iOS mobile registration client id |
| `AUTH_MICROSOFT_MANAGED_SIGNIN_ANDROID_CLIENT_ID` | The Android mobile registration client id |

Both read into `auth.microsoftManagedSignIn`
(`packages/backend/src/config/parseConfig.ts:3163`).

**What turns the feature on.** There is no feature flag, no organisation
setting and no licence gate. The feature is on for a platform as soon as that
platform's client id is set and the server can name a Microsoft tenant. A
dedicated instance therefore needs the platform client id plus the existing
`AUTH_AZURE_AD_OAUTH_TENANT_ID`. A shared instance needs the platform client id
plus one organisation with an enabled Azure SSO config naming the tenant.

Neither variable replaces the web registration. Browser sign-in keeps using
`AUTH_AZURE_AD_OAUTH_*` or the per-organisation config.

## Happy path

```
App                     Microsoft (MSAL + broker)      Lightdash server
 |                                |                            |
 |-- GET /user/login-options?mobilePlatform=ios -------------->|
 |<-- ssoPresentation + managedSignIn { clientId, authority } -|
 |                                |                            |
 |-- acquire token (forceRefresh) ->                           |
 |   broker satisfies the app protection policy                |
 |<-- ID token (aud = mobile registration, tid = customer) ----|
 |                                |                            |
 |-- POST /oauth/token  grant_type=token-exchange ------------>|
 |   subject_token=<ID token>                                  |
 |                                |                            |
 |                                |  verify signature via tenant JWKS
 |                                |  check iss, aud, exp, nbf, iat
 |                                |  resolve org from tid
 |                                |  claim token hash (single use)
 |                                |  loginWithOpenId(oid, email)
 |                                |                            |
 |<-- access_token, refresh_token, expires_in ----------------|
 |                                |                            |
 |-- API calls with the Lightdash access token --------------->|
```

## Conditional Access remediation path

The first sign-in on a device that is not yet enrolled does not return a token.
Microsoft returns a policy error and the app hands the person to the broker.

```
App                     Microsoft / Intune             Lightdash server
 |                                |                            |
 |-- acquire token --------------->                            |
 |<-- error: app protection policy required -------------------|
 |                                |                            |
 |   app shows the remediation prompt                          |
 |-- open Microsoft Authenticator ->                           |
 |                                |                            |
 |   person enrols the device, sets a PIN                      |
 |   the device restarts                                       |
 |                                |                            |
 |   app resumes the pending sign-in                           |
 |-- acquire token (forceRefresh) ->                           |
 |<-- ID token ------------------------------------------------|
 |                                |                            |
 |-- POST /oauth/token  grant_type=token-exchange ------------>|
 |<-- access_token, refresh_token -----------------------------|
```

The server sees nothing until the last two steps. Every remediation error is an
MSAL error on the device, so no Lightdash error code covers it.

**`forceRefresh` matters.** MSAL and the broker serve ID tokens from a local
cache and re-mint only when the refresh token is used. A cached token carries
its original `iat`, so a silent acquisition can present a token that is already
older than the five-minute window. The apps force a refresh on every
acquisition that feeds the exchange. This is SPK-1909 Q9.

## Decisions still open

Three questions are open on
[SPK-1909](https://linear.app/lightdash/issue/SPK-1909). The behaviour built
today is described above; these may change it.

- **Q7 — organisation-less users.** On a dedicated instance the exchange passes
  a user with no organisation straight through, because there is no
  organisation to compare against. The apps have no join-organisation screen,
  so that person sees nothing. Options: reject with a new
  `organisation_required` code, auto-join the single whitelisted organisation,
  or rely on invites.
- **Q8 — identity linking.** The first managed sign-in fails for every existing
  web user unless OIDC linking is enabled. Options: document the prerequisite,
  treat the two registrations as one trust inside the exchange, or store `oid`
  for browser sign-in too.
- **Q9 — freshness.** The five-minute `iat` window stands in for a nonce, which
  neither MSAL SDK exposes for the ID token. The apps force a refresh so a
  fresh token is minted. The alternative is to loosen the server rule.

Related: registration shape and vocabulary on
[SPK-1905](https://linear.app/lightdash/issue/SPK-1905), the security review on
[SPK-1920](https://linear.app/lightdash/issue/SPK-1920).

## App documentation

- `docs/managed-sign-in.md` in `lightdash-ios`
- `docs/managed-sign-in.md` in `lightdash-android`

## File map

| Path | Purpose |
|---|---|
| `packages/common/src/types/managedSignIn.ts` | Field names, grant identifiers, scopes and error codes |
| `packages/backend/src/services/OAuthService/managedSignIn/microsoftTokenVerifier.ts` | Discovery, JWKS cache, signature and claim checks |
| `packages/backend/src/services/OAuthService/managedSignIn/ManagedSignInService.ts` | Validation order, organisation resolution, rejection logging |
| `packages/backend/src/services/OAuthService/managedSignIn/microsoftTokenExchangeGrantType.ts` | The RFC 8693 grant |
| `packages/backend/src/models/ManagedSignInModel.ts` | Single-use claim and inline pruning |
| `packages/backend/src/models/OAuth2Model.ts` | Token-exchange grant injection for mobile clients |
| `packages/backend/src/services/UserService.ts` | `getManagedSignIn`, tenant resolution, `loginWithOpenId` |
| `packages/backend/src/config/parseConfig.ts` | `auth.microsoftManagedSignIn` |
