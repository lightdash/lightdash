import type { ToolSet } from 'ai';

const WRITE_TOOLS = new Set(['createContent', 'editContent']);
// SQL and composer chart writes can wait on user approval, so they never hold the queue.
const ORDERED_TYPES = new Set(['dashboard', 'chart']);

/**
 * Runs a turn's dashboard and chart writes one at a time in the order the model called them.
 * The queue is joined when the SDK calls execute, before any wrapper awaits (permission checks).
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
                    // Both write tools' input schemas require `type`.
                    execute: (
                        input: { type: string },
                        options: Parameters<typeof execute>[1],
                    ) => {
                        if (!ORDERED_TYPES.has(input.type))
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
