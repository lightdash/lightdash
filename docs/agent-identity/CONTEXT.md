# Agent identity

Who agents act for, what their requests may do, and who their queries run as
in the warehouse. An agent is any client that acts on a person's behalf:
the AI agent, an MCP client, the Slack bot, the CLI. Every agent screen answers one question, and "agent" is always the subject.

## Language

**Identity**:
Who agents run as on a warehouse. An organization admin sets one rule per
warehouse type on the org **Agents** page; a project admin sees the result on
the project's **Agent identity** page.
_Avoid_: AI principal, agent connections, execution identity (in copy)

**Permissions**:
What agents may do, whoever they run as. The second section of the org
**Agents** page. The organization capability list limits every role, including
custom roles. The page offers Same as the person, Read and query, and
Custom, and uses the capability-policy API. The capability
contract is in [agent-permissions.md](./agent-permissions.md).
_Avoid_: ceiling, managed mode (in copy)

**Who can use agents**:
The part of **Permissions** that says which people's agents may run:
everyone whose roles allow agents, or members of selected groups. Saved
people and project lists do not restrict agents.
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
A preview with a parent project uses the parent's shared agent account.
_Avoid_: AI service account. Do not confuse with Lightdash **service
accounts**, which are API tokens for automation, not warehouse accounts.

**My agent identity**:
The personal settings page with Agent connections and Warehouse sign-ins tabs.
A person can list connections, inspect their status and revoke active valid
connections. Warehouse sign-ins show who agents run as and let the person sign
in where needed. With no connections and no list error, the page shows warehouse
sign-ins alone.
_Avoid_: My agent connections

## Rules for copy

- Say "agents", not "AI", unless the text names a product feature such as
  Ask AI or AI agents.
- Code identifiers keep their old names; only the words people read change.
