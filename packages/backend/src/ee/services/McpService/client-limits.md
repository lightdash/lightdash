Measured 2026-11-26; client behaviour changes, re-measure before relying on a number.
What each MCP client shows the model, per channel:

| Channel                 | Claude chat                                                            | Claude Code                                    | Codex CLI                                                                |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Server instructions     | from the turn after the first tool call; cut at ~4,096 chars           | at session start; cut at 4,096                 | first line at start; full text appended to tool descriptions once loaded |
| Tool description        | when the tool is loaded; cut at ~16,384                                | when the tool is searched; cut at 16,384       | once loaded                                                              |
| Parameter descriptions  | full (60,000 measured)                                                 | full                                           | dropped                                                                  |
| Input schema            | full                                                                   | full                                           | collapsed to `unknown` above 5,000 bytes with descriptions stripped      |
| Tool results            | full (60,000 measured)                                                 | above ~25k tokens saved to a file              | not measured                                                             |
| A server change is seen | in a new chat, within 27 s of "Refresh tools list", else within 28 min | new process or `/mcp` Reconnect, then `/clear` | every new thread                                                         |

Skills behind `read_skill` are always fresh. The server cannot push "tools changed" (stateless sessions).

Production mix, 30 days to 2026-11-26: Claude chat 77.5% of calls, Claude Code 9.0%, Cursor 6.5% (untested), custom agents 5.8%, Codex 0.7%.

To re-measure: pad each channel's text with markers at known character offsets, ask the model which markers it sees, and read the last one per channel.
Log every MCP request server-side to see when a client fetches instructions, tools and skills, and which tool calls it rejects before they reach the handler.
