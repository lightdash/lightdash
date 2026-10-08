# AI agent: which model answers a prompt

Every prompt sent to an AI agent resolves its model on the server, whether it
starts a thread or continues one, and whether it comes from the web app, the
Ask AI launcher or Slack. The resolved model is recorded on the prompt, so a
thread's history shows which model answered each turn.

## Resolution order

1. **Explicit pick** — the model the user chose in the composer's model picker.
2. **Agent model** — the model set on the agent (agent settings).
3. **Organization default** — the model set in the organization's AI
   settings.
4. **Instance default** — the server's built-in default when nothing above is
   configured.

A thread does not remember the model of its first message. When an admin moves
an agent to a new model, every thread that has no explicit pick follows on its
next prompt; the composer in an existing thread shows the model the next
message will use before it is sent. One gap: an embed does not load the
organization's AI settings, so for an agent with no model of its own the
embedded composer shows the instance default while the server still resolves
the organization default.

## Explicit picks and "Agent default"

A pick is stored per agent and per browser, not per thread: picking a model
in one thread applies to the other threads and new threads of that agent in
the same browser. The first entry in the picker, **Agent default**, shows the
model the agent currently resolves to and is marked selected whenever no pick
is stored. Choosing it clears the stored pick and turns extended thinking off,
so the composer follows the agent again.

Toggling extended thinking on the agent's model sends that model explicitly
for the prompt, because reasoning needs a concrete model, but it does not
store a pick.

## Exception: battle threads

A battle thread exists to compare two fixed models side by side, so each side
keeps the model it started with and has no "Agent default" entry.
