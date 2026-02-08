import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { BACKEND_SRC, EE_DIR, DUPLICATION_CACHE, DUPLICATION_SUMMARY_CACHE } from './config';
import { escapeShellArg } from './utils';
import { withCache } from './cache';
import { callClaude } from './claude';
import { resolveFilePath } from './complexity';
import type { GraphData, GraphNode, GraphEdge, NodeDuplication, JscpdClone } from './types';

function computeDuplicationHash(graph: GraphData): string {
    const stats: string[] = [];
    for (const n of graph.nodes) {
        const fp = resolveFilePath(n.id, n.type, n.ee);
        if (fp && fs.existsSync(fp)) {
            const st = fs.statSync(fp);
            stats.push(`${fp}:${st.mtimeMs}:${st.size}`);
        }
    }
    return crypto.createHash('sha256').update(stats.sort().join('\n')).digest('hex');
}

export function runDuplicationAnalysis(graph: GraphData, force: boolean): void {
    const hash = computeDuplicationHash(graph);

    const { data: cached, fromCache } = withCache<{ edges: GraphEdge[]; perNode: Record<string, NodeDuplication> }>({
        cachePath: DUPLICATION_CACHE,
        label: 'Duplication',
        force,
        computeHash: () => hash,
        compute: () => {
            const fileToNode = new Map<string, GraphNode>();
            for (const n of graph.nodes) {
                const fp = resolveFilePath(n.id, n.type, n.ee);
                if (fp) {
                    fileToNode.set(fp, n);
                }
            }

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-jscpd-'));

            const srcDirs = [
                path.join(BACKEND_SRC, 'services'),
                path.join(BACKEND_SRC, 'models'),
                path.join(BACKEND_SRC, 'clients'),
                path.join(BACKEND_SRC, 'controllers'),
                path.join(BACKEND_SRC, 'routers'),
                path.join(EE_DIR, 'services'),
                path.join(EE_DIR, 'models'),
                path.join(EE_DIR, 'clients'),
                path.join(EE_DIR, 'controllers'),
            ].filter(d => fs.existsSync(d));

            console.log('Running jscpd for duplication analysis...');
            try {
                execSync(
                    `npx jscpd --reporters json --output ${escapeShellArg(tmpDir)} --format typescript --absolute --min-lines 5 --max-size 500kb --silent ${srcDirs.map(escapeShellArg).join(' ')}`,
                    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, cwd: path.resolve(__dirname, '../..') },
                );
            } catch (err: any) {
                if (!fs.existsSync(path.join(tmpDir, 'jscpd-report.json'))) {
                    console.warn('Warning: jscpd failed and produced no report. Skipping duplication analysis.');
                    fs.rmSync(tmpDir, { recursive: true });
                    return { edges: [], perNode: {} };
                }
            }

            const reportPath = path.join(tmpDir, 'jscpd-report.json');
            if (!fs.existsSync(reportPath)) {
                console.warn('Warning: jscpd produced no report. Skipping duplication analysis.');
                fs.rmSync(tmpDir, { recursive: true });
                return { edges: [], perNode: {} };
            }

            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            fs.rmSync(tmpDir, { recursive: true });

            const duplicates: JscpdClone[] = report.duplicates || [];

            const pairMap = new Map<string, {
                cloneCount: number;
                totalLines: number;
                fragments: Array<{
                    lines: number;
                    fragment: string;
                    firstStart: number;
                    firstEnd: number;
                    secondStart: number;
                    secondEnd: number;
                }>;
            }>();

            const perNodeDup = new Map<string, { clonedLines: number; totalLines: number }>();

            for (const clone of duplicates) {
                const nodeA = fileToNode.get(clone.firstFile.name);
                const nodeB = fileToNode.get(clone.secondFile.name);

                if (!nodeA || !nodeB) continue;
                if (nodeA.id === nodeB.id) continue;

                const pairKey = [nodeA.id, nodeB.id].sort().join('\0');
                const existing = pairMap.get(pairKey) || { cloneCount: 0, totalLines: 0, fragments: [] };
                existing.cloneCount++;
                const lines = clone.lines || (clone.firstFile.endLoc.line - clone.firstFile.startLoc.line + 1);
                existing.totalLines += lines;
                if (existing.fragments.length < 5) {
                    const frag = (clone.fragment || '').slice(0, 300);
                    existing.fragments.push({
                        lines,
                        fragment: frag,
                        firstStart: clone.firstFile.startLoc.line,
                        firstEnd: clone.firstFile.endLoc.line,
                        secondStart: clone.secondFile.startLoc.line,
                        secondEnd: clone.secondFile.endLoc.line,
                    });
                }
                pairMap.set(pairKey, existing);
            }

            const newEdges: GraphEdge[] = [];
            for (const [pairKey, data] of pairMap) {
                const [fromId, toId] = pairKey.split('\0');
                const edge: GraphEdge = {
                    from: fromId,
                    to: toId,
                    type: 'shares_code',
                    duplication: data,
                };
                newEdges.push(edge);
            }

            if (report.statistics?.formats?.typescript?.sources) {
                for (const [filePath, sourceStats] of Object.entries(report.statistics.formats.typescript.sources) as Array<[string, any]>) {
                    const node = fileToNode.get(filePath);
                    if (node) {
                        const existing = perNodeDup.get(node.id) || { clonedLines: 0, totalLines: 0 };
                        existing.clonedLines += sourceStats.duplicatedLines || 0;
                        existing.totalLines += sourceStats.lines || 0;
                        perNodeDup.set(node.id, existing);
                    }
                }
            }

            const perNodeResult: Record<string, NodeDuplication> = {};
            for (const [nodeId, stats] of perNodeDup) {
                const ratio = stats.totalLines > 0 ? stats.clonedLines / stats.totalLines : 0;
                perNodeResult[nodeId] = {
                    clonedLines: stats.clonedLines,
                    totalLines: stats.totalLines,
                    ratio,
                };
            }

            console.log(`Found ${duplicates.length} clone pairs, ${newEdges.length} cross-node duplication edges.`);

            return { edges: newEdges, perNode: perNodeResult };
        },
    });

    for (const edge of cached.edges) {
        graph.edges.push(edge);
    }
    for (const n of graph.nodes) {
        if (cached.perNode[n.id]) {
            n.duplication = cached.perNode[n.id];
        }
    }
}

export function summarizeDuplication(graph: GraphData, force: boolean): void {
    const dupEdges = graph.edges.filter(e => e.type === 'shares_code' && e.duplication);
    const dupNodes = graph.nodes.filter(n => n.duplication && n.duplication.ratio > 0);

    if (dupEdges.length === 0 && dupNodes.length === 0) {
        console.log('No duplication data to summarize.');
        return;
    }

    const parts = [
        ...dupEdges.map(e => `${e.from}\0${e.to}\0${e.duplication!.cloneCount}\0${e.duplication!.fragments.map(f => f.fragment).join('')}`),
        ...dupNodes.map(n => `${n.id}\0${n.duplication!.clonedLines}\0${n.duplication!.totalLines}`),
    ].sort();
    const hash = crypto.createHash('sha256').update(parts.join('\n')).digest('hex');

    const { data: cached, fromCache } = withCache<{ pairAdvice: Record<string, string>; nodeSummaries: Record<string, string> }>({
        cachePath: DUPLICATION_SUMMARY_CACHE,
        label: 'Duplication summary',
        force,
        computeHash: () => hash,
        compute: () => {
            const pairDescriptions = dupEdges.map(e => {
                const d = e.duplication!;
                const snippets = d.fragments.slice(0, 3).map((f, i) =>
                    `  Fragment ${i + 1} (${f.lines} lines, ${e.from}:${f.firstStart}-${f.firstEnd} / ${e.to}:${f.secondStart}-${f.secondEnd}):\n    ${f.fragment.slice(0, 400)}`
                ).join('\n');
                return `PAIR: ${e.from} <-> ${e.to} (${d.cloneCount} clones, ${d.totalLines} total duplicated lines)\n${snippets}`;
            }).join('\n\n');

            const nodeDescriptions = dupNodes.map(n => {
                const d = n.duplication!;
                return `${n.id} (${n.type}): ${Math.round(d.ratio * 100)}% duplicated (${d.clonedLines}/${d.totalLines} lines)`;
            }).join('\n');

            const prompt = `You are analyzing code duplication in the Lightdash backend (an open-source BI tool built with TypeScript/Express).

Below are duplicated code pairs between backend nodes (controllers, services, models, clients) and per-node duplication ratios.

DUPLICATED PAIRS WITH CODE FRAGMENTS:

${pairDescriptions}

PER-NODE DUPLICATION RATIOS:

${nodeDescriptions}

YOUR TASK: Provide two types of output:

1. For each PAIR: Write ONE actionable refactoring suggestion (max 80 chars). Be specific about:
   - WHAT the duplicated code does (e.g., "request validation boilerplate", "SCIM response formatting")
   - WHERE to extract it (e.g., "base controller", "shared middleware", "utility function")
   - HOW it helps (e.g., "single source of truth for SCIM serialization")

   Good examples:
   - "Extract SCIM list-response builder into shared scimHelpers.ts"
   - "Shared query-result-to-response middleware would eliminate 46 lines"
   - "DRY: extract dashboard/chart permission check into base controller"

   Bad examples (NEVER do these):
   - "Consider refactoring" (vague, no specifics)
   - "26 lines duplicated between these files" (restating data)
   - "These share common code" (obvious from context)

2. For each NODE with >10% duplication: Write ONE line (max 70 chars) about the overall duplication pattern.
   - Focus on the pattern: "mostly boilerplate responses" vs "business logic clones"
   - Identify if it's structural (framework patterns) vs concerning (copied logic)

   Good examples:
   - "Boilerplate-heavy — TSOA migration would eliminate most clones"
   - "Real logic duplication — shared query builder needed"
   - "Router response pattern — not worth extracting"

Return as JSON with "pairAdvice" (keyed by "nodeA\\0nodeB" with names alphabetically sorted) and "nodeSummaries" (keyed by node name).`;

            console.log(`Calling Claude to analyze ${dupEdges.length} duplication pairs, ${dupNodes.length} nodes...`);
            const output = callClaude<{ pairAdvice: Record<string, string>; nodeSummaries: Record<string, string> }>({
                prompt,
                jsonSchema: {
                    type: 'object',
                    properties: {
                        pairAdvice: {
                            type: 'object',
                            additionalProperties: { type: 'string' },
                        },
                        nodeSummaries: {
                            type: 'object',
                            additionalProperties: { type: 'string' },
                        },
                    },
                    required: ['pairAdvice', 'nodeSummaries'],
                    additionalProperties: false,
                },
            });

            console.log(`Got advice for ${Object.keys(output.pairAdvice).length} pairs, ${Object.keys(output.nodeSummaries).length} nodes.`);

            return output;
        },
    });

    for (const edge of dupEdges) {
        const sorted = [edge.from, edge.to].sort();
        const advice = cached.pairAdvice[sorted.join('\0')] || cached.pairAdvice[sorted.join(' ')];
        if (advice) {
            edge.duplication!.advice = advice;
        }
    }
    for (const node of dupNodes) {
        if (cached.nodeSummaries[node.id]) {
            node.duplicationSummary = cached.nodeSummaries[node.id];
        }
    }
}
