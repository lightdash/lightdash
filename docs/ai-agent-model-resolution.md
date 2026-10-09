# AI agent: which model answers a prompt

A thread keeps the model of its first prompt. The server resolves the model
when a thread starts, whether from the web app, the Ask AI launcher or Slack,
and every follow-up in that thread runs on the same model. The resolved model
is recorded on each prompt, so a thread's history shows which model answered
each turn.

## Resolution order for a new thread

1. **Explicit pick** — the model the user chose in the new-thread composer's
   model picker.
2. **Agent model** — the model set on the agent (agent settings).
3. **Organization default** — the model set in the organization's AI
   settings.
4. **Instance default** — the server's built-in default when nothing above is
   configured.

A deprecated preset that has a replacement is swapped for the replacement when
a thread starts.

## Follow-ups

The thread composer shows the thread's model and has no picker. The server
ignores a model sent with a follow-up, and neither a new pick nor a change to
the agent's model moves an existing thread. When the thread's model is
deprecated, the thread keeps running on it and the composer warns the user,
pointing to a new thread for the newer model. A thread with no recorded model
resolves like a new thread on each prompt.

## Explicit picks and "Agent default"

A pick is stored per agent and per browser and applies to the next new thread
of that agent in the same browser. The first entry in the picker, **Agent
default**, shows the model the agent currently resolves to and is marked
selected whenever no pick is stored. Choosing it clears the stored pick and
turns extended thinking off, so new threads follow the agent again.

Toggling extended thinking on the agent's model sends that model explicitly
for the prompt, because reasoning needs a concrete model, but it does not
store a pick.

## Battle threads

A battle thread compares two fixed models side by side, so its picker has no
"Agent default" entry.
