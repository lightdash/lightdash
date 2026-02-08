import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    parseServiceRepository,
    parseControllers,
    parseRouters,
    parseEeIndex,
    parseEeControllers,
} from './parsing';
import { buildGraph } from './graph';
import { collectGitActivity } from './git-activity';
import { classifyDomains } from './domains';
import { summarizeGitActivity, summarizeHealthScores } from './summaries';
import { runDuplicationAnalysis, summarizeDuplication } from './duplication';
import { collectSentryActivity } from './sentry';
import { generateHtml } from './template/generate';

export function main(): void {
    const args = process.argv.slice(2);
    const jsonOnly = args.includes('--json');
    const outIdx = args.indexOf('--out');
    const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
    const forceRefresh = args.includes('--refresh');
    const includeSentry = args.includes('--sentry');

    const services = parseServiceRepository();
    const controllers = parseControllers();
    const routers = parseRouters();

    const eeParsed = parseEeIndex();
    const eeControllers = parseEeControllers();
    const eeData = {
        services: eeParsed.services,
        controllers: eeControllers,
        modelNames: eeParsed.modelNames,
        clientNames: eeParsed.clientNames,
    };

    const graph = buildGraph(services, controllers, routers, eeData);
    collectGitActivity(graph.nodes, true);

    const domains = classifyDomains(graph, forceRefresh);
    const nodeToDomain: Record<string, string> = {};
    for (const [domain, nodeIds] of Object.entries(domains)) {
        for (const id of nodeIds) {
            nodeToDomain[id] = domain;
        }
    }
    for (const node of graph.nodes) {
        if (nodeToDomain[node.id]) {
            node.domain = nodeToDomain[node.id];
        }
    }

    const summaries = summarizeGitActivity(graph, forceRefresh);
    for (const node of graph.nodes) {
        const gs = summaries[node.id] || summaries[`${node.id} (${node.type})`];
        if (gs) {
            node.gitSummary = gs;
        }
    }

    const healthSummaries = summarizeHealthScores(graph, forceRefresh);
    for (const node of graph.nodes) {
        const hs = healthSummaries[node.id] || healthSummaries[`${node.id} (${node.type})`];
        if (hs) {
            node.healthSummary = hs;
        }
    }

    runDuplicationAnalysis(graph, forceRefresh);
    summarizeDuplication(graph, forceRefresh);

    if (includeSentry) {
        collectSentryActivity(graph, forceRefresh);
    }

    if (jsonOnly) {
        process.stdout.write(JSON.stringify(graph, null, 2));
        process.exit(0);
    }

    const html = generateHtml(graph);

    const outputPath = outDir
        ? path.resolve(outDir, 'dep-graph.html')
        : path.join('/tmp', 'lightdash-dep-graph.html');

    if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, html);

    const eeNodeCount = graph.nodes.filter((n) => n.ee).length;
    const eeLabel = eeNodeCount > 0 ? ` (+${eeNodeCount} EE)` : '';
    console.log(
        `Generated: ${graph.stats.controllers} controllers, ` +
            `${graph.stats.routers} routers, ` +
            `${graph.stats.services} services, ${graph.stats.models} models, ` +
            `${graph.stats.clients} clients (${graph.stats.totalEdges} edges)${eeLabel}`,
    );
    console.log(`Written to: ${outputPath}`);

    if (!args.includes('--publish')) {
        const platform = process.platform;
        const openCmd =
            platform === 'darwin'
                ? 'open'
                : platform === 'win32'
                  ? 'start'
                  : 'xdg-open';
        try {
            execSync(`${openCmd} "${outputPath}"`);
        } catch {
            // silent — might be running headless
        }
    }

    if (args.includes('--publish')) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-'));
        execSync('git clone --depth 1 git@github.com:charliedowler/lightdash-dep-graph.git .', { cwd: tmp, stdio: 'inherit' });
        fs.writeFileSync(path.join(tmp, 'index.html'), html);
        execSync('git add index.html', { cwd: tmp });
        const dateStr = new Date().toISOString().slice(0, 10);
        const commitMsg = `Update dep-graph — ${dateStr}`;
        try {
            execSync(`git commit -m "${commitMsg}"`, { cwd: tmp, stdio: 'inherit' });
            execSync('git push', { cwd: tmp, stdio: 'inherit' });
            console.log('Published to https://charliedowler.github.io/lightdash-dep-graph/');
        } catch {
            console.log('No changes to publish.');
        }
        fs.rmSync(tmp, { recursive: true });
    }
}
