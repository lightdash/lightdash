# Embed

## Review

- **Skip when:** vector embeddings, or users and roles (Access).
- **Worst case:** an embedded viewer sees another customer's data, or more than the token allows.
- **Evidence:** read the code, and look for tests with a token that should be denied.
- **token bounds it:** every embedded read or action is limited to the content, filters and user attributes in the JWT; anything wider is Fix.
- **token verified:** signature, expiry and the project's embed secret are checked on every request.
- **no app session:** an embed token never reaches routes meant for logged-in users, and an app session adds nothing to an embed.
- **save keeps hidden:** a save from an embed writes back what the token hides as loaded (the filters, their order, the sections they sit in), and no editor control can remove or change it.
  Lost content is Fix; lost order is Heads-up.
- **denied tested:** a test asserts the out-of-token case is denied.
  Missing is Heads-up.
- **iframe and SDK both:** the change works in the iframe and in the SDK, or says which it covers.

## Impact

- **breaking:** viewers lose capabilities or SDK integrations must change.
- **notable:** viewer capability, SDK option or token option added.
- **minor:** wording.

## Diff

```ts
type EmbedDiff = Diff;
```

- **Name:** the embed surface (`dashboard embed`, `SDK Dashboard`).
- **Note:** what an embedded viewer can do now.
- **Granularity:** one diff per surface and ability.
  A gain is still checked against the token's bounds.

```json
{ "lens": "Embed", "change": "added", "impact": "notable", "name": "SDK editable dashboard", "note": "shows Explore from here" }
```
