# Agent-started builds name the app up front

The builder creates an app with a placeholder slug (`app-N`) and lets an ambient
model name it mid-build; the slug is rewritten from that name whenever it lands.
The AI agent and MCP tools instead require the caller to supply `name`, so the
slug is derived and deduped at creation and never changes. Those callers hold the
slug across a multi-minute build — an MCP client polls build status with it and
an agent thread references it later — and a slug that flips mid-build would make
that reference fail at a random point. Naming before enqueue with the ambient
model was rejected because it adds an LLM call, a timeout, and a fallback branch
to the start path, while the calling model already writes the brief and can name
the app for free. The builder keeps auto-naming: its create call is deliberately
instant.
