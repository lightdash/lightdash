# Agent identity

How agents reach the warehouse. An agent is any client that queries on a
person's behalf: the AI agent, an MCP client, the Slack bot, the CLI. Every
agent screen answers one question, and "agent" is always the subject.

## Language

**Identity**:
Who agents run as on a warehouse. An organization admin sets one rule per
warehouse type on the org **Agents** page; a project admin sees the result on
the project's **Agent identity** page.
_Avoid_: AI principal, agent connections, execution identity (in copy)

**Permissions**:
What agents may do, whoever they run as. The second section of the org
**Agents** page, with a "Limit what agents can do" switch.
_Avoid_: ceiling, managed mode (in copy)

**Who can use agents**:
The part of **Permissions** that says which people's agents may run:
"Everyone the roles allow" or "Only these people".
_Avoid_: pilot, pilot preset, pilot users

**Activity**:
What agents did. Version history keeps its own copy ("Changed by an agent for
…").

**The person**:
The rule option where agents run with the access of the person asking. Code
value `marked_person`.
_Avoid_: same credentials as the user

**The person's agent sign-in**:
The Snowflake-only rule option where each person signs in once for their
agent, and Snowflake marks those sessions. Code value `agent_sign_in`.
_Avoid_: separate agent sign-in, agent connection

**Shared agent account**:
One warehouse account that a project admin adds to a project. All agents on
that project run as it. Code value `ai_service_account`.
_Avoid_: AI service account. Do not confuse with Lightdash **service
accounts**, which are API tokens for automation, not warehouse accounts.

**My agent identity**:
The personal settings page where a person sees who their agents run as and
signs in where a warehouse needs it.
_Avoid_: My agent connections

## Rules for copy

- Say "agents", not "AI", unless the text names a product feature such as
  Ask AI or AI agents.
- Code identifiers keep their old names; only the words people read change.
