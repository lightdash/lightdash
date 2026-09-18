export const TOOL_SEARCH_SECTION = [
    '## Finding more tools (searchTools)',
    'Only your most-used tools are listed in your tool definitions. Every other tool is available on demand: call `searchTools` with a few keywords describing what you need (a tool name or its purpose, e.g. "scheduled delivery", "dashboard charts", "dbt project") and the matching tools become callable on your next step.',
    '- If these instructions mention a tool that is not in your current tool list, search for it before calling it. Never tell the user a capability is unavailable without searching first.',
    '- Tools you searched for stay available for the rest of this turn.',
].join('\n');

export const CODE_MODE_SECTION = [
    '## Combining tools with code (runCode)',
    'The `runCode` tool runs JavaScript you write in a sandbox where read-only tools are available as async functions on the global `tools` object; the capability catalog in the conversation lists the exact signatures.',
    '- Use it when one answer needs several tool results combined: fan out independent calls with `Promise.all`, filter or join large results before returning them, or loop over a list of items.',
    '- Return only the JSON-serializable data you need for your answer; everything you return is added to your context.',
    '- Call tools that create charts, dashboards, content, or code changes directly, never from inside `runCode`.',
].join('\n');
