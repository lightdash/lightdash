import type { ModelMessage, ToolSet } from 'ai';
import { z } from 'zod';
import { toolFailure } from '../utils/structuredToolResult';

const WRITE_TOOLS = new Set(['createContent', 'editContent']);
// SQL and composer chart writes can wait on user approval, so they never hold the queue.
const ORDERED_TYPES = new Set(['dashboard', 'chart']);

const dashboardCreate = z.object({
    type: z.literal('dashboard'),
    content: z.object({ slug: z.string() }),
});
const chartCreateInDashboard = z.looseObject({
    type: z.literal('chart'),
    content: z.looseObject({ dashboardSlug: z.string() }),
});
const failedOutput = z.object({
    metadata: z.object({ status: z.literal('error') }),
});
const savedOutput = z.object({
    metadata: z.object({ status: z.literal('success'), slug: z.string() }),
});

/**
 * Runs a turn's dashboard and chart writes one at a time in the order the model called them.
 * The queue is joined when the SDK calls execute, before any wrapper awaits (permission checks).
 */
export const withOrderedContentWrites = (tools: ToolSet): ToolSet => {
    let queue: Promise<unknown> = Promise.resolve();
    // Dashboards whose create failed this turn: charts sent for them are not saved.
    const failedDashboards = new Set<string>();
    // Dashboards saved under another slug; only charts sent in the same response follow them.
    const renamedDashboards = new Map<
        string,
        { slug: string; response: ModelMessage[] }
    >();
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
                // Tool calls of one response share its messages array.
                const renamed = chart.success
                    ? renamedDashboards.get(chart.data.content.dashboardSlug)
                    : undefined;
                const toRun =
                    chart.success &&
                    renamed !== undefined &&
                    renamed.response === options.messages
                        ? {
                              ...chart.data,
                              content: {
                                  ...chart.data.content,
                                  dashboardSlug: renamed.slug,
                              },
                          }
                        : input;
                const dashboard = dashboardCreate.safeParse(input);
                let failed = true;
                try {
                    const output: unknown = await execute(toRun, options);
                    failed = failedOutput.safeParse(output).success;
                    const saved = savedOutput.safeParse(output);
                    if (
                        dashboard.success &&
                        saved.success &&
                        saved.data.metadata.slug !== dashboard.data.content.slug
                    ) {
                        renamedDashboards.set(dashboard.data.content.slug, {
                            slug: saved.data.metadata.slug,
                            response: options.messages,
                        });
                    }
                    return output;
                } finally {
                    if (dashboard.success && failed)
                        failedDashboards.add(dashboard.data.content.slug);
                    else if (dashboard.success)
                        failedDashboards.delete(dashboard.data.content.slug);
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
