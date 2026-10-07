# Snowflake agent sign-in

This runbook is for instance operators and project admins.
Agents use the person's Snowflake identity through a separate OAuth integration.
Snowflake verifies that the session is an agent session.
The normal warehouse sign-in stays separate.
The organisation rule requires the agent credential for agent queries on every Snowflake connection.
An existing enabled connection person policy also requires it.
When neither rule applies, agents use the marked person path.

## Configure the instance

Use an Enterprise licence. Create a custom OAuth integration in Snowflake.
Replace `<siteUrl>` with the instance URL, without a final slash.

```sql
CREATE SECURITY INTEGRATION LIGHTDASH_AGENT
  TYPE = OAUTH
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '<siteUrl>/api/v1/oauth/redirect/snowflake-ai'
  ENABLED = TRUE
  IS_AGENTIC = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('LIGHTDASH_AGENT');
```

The sign-in requests the `refresh_token` scope, so the integration must keep `OAUTH_ISSUE_REFRESH_TOKENS = TRUE`.
Snowflake blocks the ACCOUNTADMIN, SECURITYADMIN, ORGADMIN and GLOBALORGADMIN roles from OAuth sessions. The sign-in uses the person's default role, so each person who uses agents needs a default role outside that list.
For a local test over `http://localhost`, add `OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE` to the integration. Do not set it in production.

Set these environment variables on the instance:

- `SNOWFLAKE_AI_OAUTH_CLIENT_ID`: the client ID from the secret output.
- `SNOWFLAKE_AI_OAUTH_CLIENT_SECRET`: the client secret from the secret output.
- `SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT`: `https://<account>.snowflakecomputing.com/oauth/authorize`.
- `SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT`: `https://<account>.snowflakecomputing.com/oauth/token-request`.
- `SNOWFLAKE_AI_OAUTH_ACCOUNT`: the account identifier. Set it if the token endpoint does not identify the account.

Keep the client secret in the deployment secret store. Restart the affected processes after configuration changes.
Use the same Snowflake account for the integration and the project connection.

Enable `ai-principals`. The `snowflake-ai-sign-in` flag is optional for this path.
Either flag permits agent sign-in. The licence check still applies.
The Require agent identity switch is available to organisation admins on the Warehouse credentials page.
Use Console organization overrides or the generic feature flag environment lists.
See [feature flag precedence and refresh](feature-flags.md).

## Set the organisation rule

1. Open Warehouse credentials at `/generalSettings/warehouseCredentials`.
2. Turn on Require agent identity.
3. Check the success notification. The switch saves the rule immediately.

One organisation setting applies to every Snowflake connection in the organisation.
Snowflake project Connection settings show a read-only indicator of the rule.
The rule uses the person principal and direct transport.
Queries without an agent credential are refused while the rule is enabled.
The switch does not create Snowflake access policies.
Turning it off does not revoke issued Snowflake tokens.
Existing enabled project person policies still apply when the organisation switch is off.
Connection policy routes remain available for separate-principal API paths.

The instance has one agent OAuth integration for one Snowflake account.
A project on a second Snowflake account cannot complete the agent connection with that integration.

## Connect your agent

Open My warehouse connections and find the Agent connection section for Snowflake.
Select Connect agent and complete the Snowflake OAuth flow in the popup.
You can also connect your agent from the chat card when a query needs your agent connection.
The callback checks agent activation before it stores the refresh token.
Each person who uses agents connects their own agent.
Select Disconnect to remove the stored agent credential.

## Set warehouse rules

Snowflake owns the data rules. Lightdash does not create them.
Adapt these examples to your data and existing policies before you attach them.
Use a role with the required policy privileges.

A row access policy can exclude sensitive rows from agent sessions:

```sql
CREATE ROW ACCESS POLICY agent_rows
  AS (is_sensitive BOOLEAN) RETURNS BOOLEAN ->
    NOT COALESCE(SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN, FALSE)
    OR NOT is_sensitive;
ALTER TABLE protected_records
  ADD ROW ACCESS POLICY agent_rows ON (is_sensitive);
```

A masking policy can hide a value from agent sessions:

```sql
CREATE MASKING POLICY agent_mask
  AS (value STRING) RETURNS STRING ->
    CASE WHEN SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN
      THEN 'REDACTED'
      ELSE value
    END;
ALTER TABLE protected_records MODIFY COLUMN email
  SET MASKING POLICY agent_mask;
```

Row access and masking policies need Enterprise Edition. On Standard Edition a view
gives the same result for the columns it covers:

```sql
CREATE OR REPLACE VIEW customers_v AS
SELECT customer_id, name,
       CASE WHEN SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN
            THEN 'REDACTED' ELSE phone END AS phone
FROM customers;
```

Point the Lightdash project at the view, not the table.

A session policy can limit the agent session's privileges:

```sql
CREATE SESSION POLICY agent_session_scope
  AGENT_RESTRICTED_SESSION_SCOPE = 'SNOWFLAKE$DATA_READ_WITH_AI';
ALTER USER example_user SET SESSION POLICY agent_session_scope;
```

The restricted scope limits existing role privileges. It does not grant new privileges.
Review any existing session policy before you replace it.
See [agent identity](https://docs.snowflake.com/en/user-guide/agent-identity) and
[restricted session scopes](https://docs.snowflake.com/en/user-guide/restricted-session-scope).

## Verify the result

Run a query through an agent. Run a normal query as the same person.
Inspect the session context in each session:

```sql
SELECT SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED') AS agent_activated,
       SYS_CONTEXT('SNOWFLAKE$SESSION', 'ACTIVE_RESTRICTED_SESSION_SCOPES') AS active_scopes;
```

Inspect recent query history with an authorized audit role:

```sql
SELECT query_id, start_time, user_name, role_name, agent_type, query_tag
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= DATEADD('hour', -1, CURRENT_TIMESTAMP())
ORDER BY start_time DESC;
```

Allow for the view's ingestion delay.
The agent query has `agent_type = 'EXTERNAL_AGENT'`.
Use `query_tag` to inspect the application attribution.
A query tag alone does not prove that Snowflake verified the session.
Check that the row, masking, and session policies produce the expected restrictions.
See [QUERY_HISTORY](https://docs.snowflake.com/en/sql-reference/account-usage/query_history).

Agent queries produce a structured info log line with the message `Agent query`
before warehouse execution. Admins read it in the instance logs.
Use the JSON log format to retain the structured fields.
The fields are `queryUuid`, `projectUuid`, `warehouseConnectionUuid`, `userUuid`,
`identity` (`marked_person` or `principal`), `principalKind`, `principalRef`,
`transport`, and `context`. Agent query audits are not stored in an application table.

## Known gap

An agent session can still use `RESULT_SCAN` with a normal session's query ID.
This path is not yet closed. SPK-2638 tracks the gap.
Do not treat this feature as complete isolation from the person's prior query results.
