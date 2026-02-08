import * as crypto from 'crypto';
import { SUMMARY_CACHE, HEALTH_SUMMARY_CACHE } from './config';
import { withCache } from './cache';
import { callClaude } from './claude';
import type { GraphData } from './types';

function computeSummaryHash(graph: GraphData): string {
    const parts = graph.nodes
        .filter((n) => n.gitActivity && n.gitActivity.recentCommits.length > 0)
        .map(
            (n) =>
                `${n.id}:${n.gitActivity!.recentCommits.map((c) => c.hash).join(',')}`,
        )
        .sort()
        .join('\n');
    return crypto.createHash('sha256').update(parts).digest('hex');
}

export function summarizeGitActivity(
    graph: GraphData,
    force: boolean,
): Record<string, string> {
    const hash = computeSummaryHash(graph);

    const { data: cached } = withCache<{ summaries: Record<string, string> }>({
        cachePath: SUMMARY_CACHE,
        label: 'Summary',
        force,
        computeHash: () => hash,
        compute: () => {
            const nodesWithCommits = graph.nodes.filter(
                (n) => n.gitActivity && n.gitActivity.recentCommits.length > 0,
            );

            if (nodesWithCommits.length === 0) {
                console.log('No nodes with recent commits to summarize.');
                return { summaries: {} };
            }

            const nodeDescriptions = nodesWithCommits
                .map((n) => {
                    const commits = n
                        .gitActivity!.recentCommits.map(
                            (c) => `  ${c.hash} ${c.message} (${c.author}, ${c.relativeDate})`,
                        )
                        .join('\n');
                    return `${n.id} (${n.type}):\n${commits}`;
                })
                .join('\n\n');

            const prompt = `You are summarizing recent git activity for nodes in a backend dependency graph of Lightdash (an open-source BI tool).

For each node below, write a 3-line summary of what changed recently (one line per recent commit). Each line should be max 60 chars, present tense, specific about what changed (not just "updated" or "modified"). Focus on the business intent. Separate lines with newlines.

NODES AND THEIR RECENT COMMITS:

${nodeDescriptions}

Return a summary for each node. Use ONLY the node name as the key (e.g., "ProjectService", not "ProjectService (service)").`;

            console.log(
                `Calling Claude to summarize ${nodesWithCommits.length} nodes...`,
            );
            const output = callClaude<{ summaries: Record<string, string> }>({
                prompt,
                jsonSchema: {
                    type: 'object',
                    properties: {
                        summaries: {
                            type: 'object',
                            additionalProperties: { type: 'string' },
                        },
                    },
                    required: ['summaries'],
                    additionalProperties: false,
                },
            });

            const summaryCount = Object.keys(output.summaries).length;
            console.log(
                `Got summaries for ${summaryCount} nodes (${nodesWithCommits.length} requested).`,
            );

            return output;
        },
    });

    return cached.summaries;
}

export function summarizeHealthScores(
    graph: GraphData,
    force: boolean,
): Record<string, string> {
    const edgeCounts: Record<string, number> = {};
    graph.edges.forEach((e) => {
        edgeCounts[e.from] = (edgeCounts[e.from] || 0) + 1;
        edgeCounts[e.to] = (edgeCounts[e.to] || 0) + 1;
    });

    const parts = graph.nodes
        .map((n) => {
            const edges = edgeCounts[n.id] || 0;
            const cyc = n.complexity?.cyclomatic || 0;
            const cog = n.complexity?.cognitive || 0;
            let line = `${n.id}:${edges}:${n.lineCount || 0}:${cyc}:${cog}:${n.gitActivity?.churn || 0}:${n.gitActivity?.commits || 0}`;
            if (n.sentryActivity) {
                line += `:${n.sentryActivity.totalRequests}:${n.sentryActivity.totalErrors}:${n.sentryActivity.topError || ''}:${n.sentryActivity.topErrorCount}`;
            }
            return line;
        })
        .sort()
        .join('\n');
    const hash = crypto.createHash('sha256').update(parts).digest('hex');

    const { data: cached } = withCache<{ summaries: Record<string, string> }>({
        cachePath: HEALTH_SUMMARY_CACHE,
        label: 'Health summary',
        force,
        computeHash: () => hash,
        compute: () => {
            const nodeDescriptions = graph.nodes
                .map((n) => {
                    const edges = edgeCounts[n.id] || 0;
                    const lines = n.lineCount || 0;
                    const cyc = n.complexity?.cyclomatic || 0;
                    const cog = n.complexity?.cognitive || 0;
                    const churn = n.gitActivity?.churn || 0;
                    const commits = n.gitActivity?.commits || 0;
                    const authors = n.gitActivity?.authors || 0;
                    let desc = `${n.id} (${n.type}): ${edges} edges, ${lines} lines, cyclomatic ${cyc}, cognitive ${cog}, ${churn} churn (6mo), ${commits} total commits, ${authors} authors`;
                    if (n.sentryActivity) {
                        const sa = n.sentryActivity;
                        const fmtReqs = sa.totalRequests >= 1e6 ? (sa.totalRequests / 1e6).toFixed(1) + 'M' : sa.totalRequests >= 1e3 ? (sa.totalRequests / 1e3).toFixed(1) + 'K' : String(sa.totalRequests);
                        desc += ` | ${fmtReqs} requests, ${(sa.errorRate * 100).toFixed(1)}% error rate`;
                        if (sa.topError) {
                            desc += `, top error: "${sa.topError}" (${sa.topErrorCount} occurrences)`;
                        }
                    }
                    return desc;
                })
                .join('\n');

            const prompt = `You are analyzing backend dependency-injection nodes in Lightdash (an open-source BI tool).

The user already sees the raw numbers (edges, lines, cyclomatic, cognitive, churn, commits) in the tooltip. Your job is to provide INSIGHT the numbers alone don't show — what the combination of metrics means, what the risk is, or what action to take.

NEVER restate the numbers. Instead explain WHY the combination matters or WHAT to do about it.

For each node, write ONE line (max 70 chars). Focus on:
- Cross-metric patterns: "high complexity + high churn = regression risk"
- Actionable advice: "split into query-building and execution halves"
- Risk classification: what kind of problem this node represents
- Comparisons: "god service — owns too many concerns"
- Production errors: if a node has a high error rate or a dominant error, call it out — "NotFoundError dominates — likely missing validation" or "clean production profile, no action needed"
- For healthy nodes: what makes them a good example

Tone: opinionated, direct, like a senior engineer's code review.

Good examples:
- "God service — owns auth, queries, and scheduling"
- "Split candidate: query building vs execution"
- "Regression risk — complex and actively changing"
- "Stable, well-scoped — good extraction example"
- "Bottleneck: every controller depends on this"
- "Thin wrapper, could inline into parent service"

Bad examples (NEVER do these):
- "CRITICAL: 35 edges, 286 branches" (just restating numbers)
- "High coupling (45 edges) with active churn" (restating with labels)
- "Complex with 332 cognitive complexity" (restating)

NODES AND METRICS:
${nodeDescriptions}

Return a summary for each node. Use ONLY the node name as the key (e.g., "ProjectService", not "ProjectService (service)").`;

            console.log(
                `Calling Claude to summarize health for ${graph.nodes.length} nodes...`,
            );
            const output = callClaude<{ summaries: Record<string, string> }>({
                prompt,
                jsonSchema: {
                    type: 'object',
                    properties: {
                        summaries: {
                            type: 'object',
                            additionalProperties: { type: 'string' },
                        },
                    },
                    required: ['summaries'],
                    additionalProperties: false,
                },
            });

            const summaryCount = Object.keys(output.summaries).length;
            console.log(
                `Got health summaries for ${summaryCount} nodes (${graph.nodes.length} requested).`,
            );

            return output;
        },
    });

    return cached.summaries;
}
