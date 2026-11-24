import type { ToolSet } from 'ai';
import { z } from 'zod';
import { toolFailure } from '../utils/structuredToolResult';

const WRITE_TOOLS = new Set(['createContent', 'editContent']);
// SQL and composer chart writes can wait on user approval, so they never hold the queue.
const ORDERED_TYPES = new Set(['dashboard', 'chart']);

const dashboardCreate = z.object({
    type: z.literal('dashboard'),
    content: z.object({ slug: z.string() }),
});
const chartCreateInDashboard = z.object({
    type: z.literal('chart'),
    content: z.object({ dashboardSlug: z.string() }),
});
const failedOutput = z.object({
    metadata: z.object({ status: z.literal('error') }),
});

/**
 * Runs a turn's dashboard and chart writes one at a time in the order the model called them.
 * The queue is joined when the SDK calls execute, before any wrapper awaits (permission checks).
 */
export const withOrderedContentWrites = (tools: ToolSet): ToolSet => {
    let queue: Promise<unknown> = Promise.resolve();
    // Dashboards whose create failed this turn: charts sent for them are not saved.
    const failedDashboards = new Set<string>();
    return Object.fromEntries(
        Object.entries(tools).map(([toolName, toolDef]) => {
            const { execute } = toolDef;
            if (!WRITE_TOOLS.has(toolName) || typeof execute !== 'function')
                return [toolName, toolDef];
            const write = async (
                input: { type: string },
                options: Parameters<typeof execute>[1],
            ) => {
                const chart = chartCreateInDashboard.safeParse(input);
                if (
                    chart.success &&
                    failedDashboards.has(chart.data.content.dashboardSlug)
                ) {
                    return toolFailure(
                        `Dashboard "${chart.data.content.dashboardSlug}" was not created, so this chart was not saved. Create the dashboard first, then its charts.`,
                    );
                }
                const dashboard = dashboardCreate.safeParse(input);
                let failed = true;
                try {
                    const output: unknown = await execute(input, options);
                    failed = failedOutput.safeParse(output).success;
                    return output;
                } finally {
                    if (dashboard.success && failed)
                        failedDashboards.add(dashboard.data.content.slug);
                }
            };
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
                        const run = queue.then(() => write(input, options));
                        queue = run.catch(() => undefined);
                        return run;
                    },
                },
            ];
        }),
    ) as ToolSet;
};
