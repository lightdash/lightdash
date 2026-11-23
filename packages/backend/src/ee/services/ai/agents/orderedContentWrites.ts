import type { ToolSet } from 'ai';

const WRITE_TOOLS = new Set(['createContent', 'editContent']);
const ORDERED_TYPES = new Set(['dashboard', 'chart']);

/**
 * Runs a turn's dashboard and chart writes one at a time in the order the model called them.
 * The queue is joined when the SDK calls execute, before any wrapper awaits (permission checks),
 * so a dashboard created in the same response is saved before its charts.
 */
export const withOrderedContentWrites = (tools: ToolSet): ToolSet => {
    let queue: Promise<unknown> = Promise.resolve();
    return Object.fromEntries(
        Object.entries(tools).map(([toolName, toolDef]) => {
            const { execute } = toolDef;
            if (!WRITE_TOOLS.has(toolName) || typeof execute !== 'function')
                return [toolName, toolDef];
            return [
                toolName,
                {
                    ...toolDef,
                    execute: (input: { type?: unknown }, options: never) => {
                        if (!ORDERED_TYPES.has(String(input?.type)))
                            return execute(input, options);
                        const run = queue.then(() => execute(input, options));
                        queue = run.catch(() => undefined);
                        return run;
                    },
                },
            ];
        }),
    ) as ToolSet;
};
