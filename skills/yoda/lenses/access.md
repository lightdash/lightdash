# Access

## Review

- **Skip when:** no route, guard, role or token scope changes, embed tokens only, including what an embed token can reach (Embed), or a frontend-only guard that mirrors a server check (UI).
- **Worst case:** data visible to the wrong user or org.
- **Evidence:** read the code, and look for tests that the denied case is denied.
- **checked per resource:** every new or changed read or write calls CASL `can` with the specific resource's org, project and space, not only the org.
  A missing or org-only check is Fix.
- **tenant bound:** a uuid from the request is resolved within the caller's org or project before use; a lookup by uuid alone is Fix.
- **tokens no wider:** service accounts, personal access tokens and OAuth clients get no access beyond their scope; a new endpoint states what it does for each.
- **denied tested:** a test asserts the denied case, not only the allowed one.
  Missing is Heads-up.
- **backend enforces:** hiding a control in the UI is never the only guard.
- **hidden fields stay hidden:** a new query or result path hides attribute-restricted fields the way explores do. A leak is Fix.
- **additive abilities:** an org-level ability can't be revoked by a project custom role, and a new scope touches all 6 ability files with the parity test green.
- **by uuid:** content is authorized by its resolved uuid.
  A slug may locate it only with enforced uniqueness within the caller's org or project and the same resource checks on the resolved uuid before use.
  Ambiguous resolution or bypassed resource checks are Fix.
- **identity trusted:** SSO and SCIM never trust an IdP email for account linking (Entra email is untrusted, use the UPN), and SCIM tokens are treated as org-wide.

## Impact

- **breaking:** a used ability revoked or narrowed.
- **notable:** an ability granted or widened.

## Diff

```ts
type AccessDiff = Diff;
```

- **Name:** a role, token type or condition (`Viewer (flag on)`, `admin service account`).
- **Note:** what the group can now do: a usable ability, not a scope or limit, with its greppable scope if useful.
- **Granularity:** one diff per group whose ability actually changes: `added` grants it, `deleted` revokes it, `modified` changes its reach.
  No diff for a group whose ability stays the same, even when the scope behind it moves; a new way to use an ability a group already has (a new route, CLI command or token type) is `modified`, noted with the new way.

```json
{ "lens": "Access", "change": "deleted", "impact": "breaking", "name": "embed with no allowed spaces", "note": "can no longer attach files" }
```
