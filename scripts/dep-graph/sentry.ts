import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    CONTROLLERS_DIR,
    ROUTERS_DIR,
    EE_CONTROLLERS_DIR,
    SENTRY_CACHE,
    SENTRY_CACHE_TTL,
} from './config';
import { matchAll } from './utils';
import { withCache } from './cache';
import type {
    GraphData,
    GraphNode,
    ControllerRoute,
    SentryRawData,
    SentryActivity,
    SentryEndpoint,
} from './types';

function parseControllerRoutes(): Record<string, ControllerRoute> {
    const routes: Record<string, ControllerRoute> = {};

    const patterns = [
        { dir: CONTROLLERS_DIR, prefix: '' },
        { dir: path.join(CONTROLLERS_DIR, 'v2'), prefix: 'v2/' },
        { dir: EE_CONTROLLERS_DIR, prefix: 'ee/' },
    ];

    for (const { dir, prefix } of patterns) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
        for (const file of files) {
            if (file === 'baseController.ts' || file === 'index.ts' || file.includes('.test.') || file.includes('.spec.'))
                continue;
            const fpath = path.join(dir, file);
            const content = fs.readFileSync(fpath, 'utf-8');
            const routeMatch = content.match(/@Route\(['"`]([^'"`]+)['"`]\)/);
            if (routeMatch) {
                const name = file.replace('.ts', '');
                const displayName = prefix + name;
                const subPaths = matchAll(content, /@(?:Get|Post|Put|Patch|Delete)\(['"`]([^'"`]+)['"`]\)/g);
                routes[displayName] = { base: routeMatch[1], subPaths };
            }
        }
    }

    return routes;
}

function parseRouterMountPaths(): Record<string, string> {
    const mounts: Record<string, string> = {};
    const apiRouterPath = path.join(ROUTERS_DIR, 'apiV1Router.ts');
    if (!fs.existsSync(apiRouterPath)) return mounts;

    const content = fs.readFileSync(apiRouterPath, 'utf-8');
    const mountRe = /apiV1Router\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = mountRe.exec(content)) !== null) {
        const mountPath = `/api/v1${m[1]}`;
        const varName = m[2];
        const files = fs.existsSync(ROUTERS_DIR) ? fs.readdirSync(ROUTERS_DIR).filter((f) => f.endsWith('.ts')) : [];
        for (const file of files) {
            const name = file.replace('.ts', '');
            if (name === varName || name + 'Router' === varName || varName === name) {
                mounts[name] = mountPath;
                break;
            }
        }
        if (!mounts[varName] && !Object.values(mounts).includes(mountPath)) {
            const simpleName = varName.replace(/Router$/, '');
            for (const file of files) {
                const name = file.replace('.ts', '');
                if (name.toLowerCase().includes(simpleName.toLowerCase())) {
                    mounts[name] = mountPath;
                    break;
                }
            }
        }
    }
    return mounts;
}

function fetchSentryData(token: string): SentryRawData {
    const baseUrl = 'https://sentry.io/api/0/organizations/lightdash/events/';
    const project = '5959292';

    function sentryGet(params: string): any {
        const url = `${baseUrl}?project=${project}&statsPeriod=30d&${params}`;
        try {
            const result = execSync(
                `curl -sS -H "Authorization: Bearer ${token}" '${url}'`,
                { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
            );
            return JSON.parse(result);
        } catch (err: any) {
            console.warn(`Warning: Sentry API call failed: ${err.message}`);
            return { data: [] };
        }
    }

    console.log('Fetching Sentry data...');

    const allTxnRows: any[] = [];
    for (let page = 0; page < 10; page++) {
        const cursor = page === 0 ? '' : `&cursor=0:${page * 100}:0`;
        const result = sentryGet(
            `dataset=metricsEnhanced&field=transaction&field=count()&field=p95(transaction.duration)&sort=-count()&per_page=100${cursor}`,
        );
        const rows = result.data || [];
        if (rows.length === 0) break;
        allTxnRows.push(...rows);
    }

    const routeMap = new Map<string, { count: number; p95: number }>();
    for (const row of allTxnRows) {
        const rawTxn: string = row.transaction;
        if (!rawTxn.includes('/api/')) continue;
        const route = rawTxn.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '');
        const existing = routeMap.get(route) || { count: 0, p95: 0 };
        existing.count += row['count()'] || 0;
        existing.p95 = Math.max(existing.p95, row['p95(transaction.duration)'] || 0);
        routeMap.set(route, existing);
    }
    const transactions = Array.from(routeMap.entries()).map(([route, data]) => ({
        transaction: route,
        count: data.count,
        p95: data.p95,
    }));

    const errResult = sentryGet(
        'dataset=errors&field=transaction&field=count()&sort=-count()&per_page=100',
    );
    const errors = (errResult.data || []).map((row: any) => ({
        culprit: row.transaction,
        count: row['count()'] || 0,
    }));

    const spanResult = sentryGet(
        'dataset=metricsEnhanced&field=transaction&field=count()&query=transaction%3A*Service.*&sort=-count()&per_page=100',
    );
    const spans = (spanResult.data || []).map((row: any) => ({
        transaction: row.transaction,
        count: row['count()'] || 0,
    }));

    const errorTitleResult = sentryGet(
        'dataset=errors&field=title&field=transaction&field=issue&field=issue.id&field=count()&sort=-count()&per_page=100',
    );
    const errorTitles = (errorTitleResult.data || [])
        .filter((row: any) => row.transaction && row.title)
        .map((row: any) => ({
            title: row.title as string,
            transaction: row.transaction as string,
            count: (row['count()'] || 0) as number,
            issueId: (row.issue as string) || null,
            groupId: (row['issue.id'] as string) || null,
        }));

    console.log(`  ${transactions.length} transactions, ${errors.length} error culprits, ${errorTitles.length} error titles, ${spans.length} service spans.`);

    return { transactions, errors, spans, errorTitles };
}

function matchSentryToNodes(
    rawData: SentryRawData,
    graph: GraphData,
    controllerRoutes: Record<string, ControllerRoute>,
    routerMounts: Record<string, string>,
): void {
    const routeMatchers: Array<{ nodeId: string; prefix: string; regex: RegExp }> = [];

    for (const [nodeId, ctrl] of Object.entries(controllerRoutes)) {
        if (ctrl.subPaths.length > 0) {
            for (const sub of ctrl.subPaths) {
                const fullPath = ctrl.base + (sub.startsWith('/') ? '' : '/') + sub;
                const regexStr = fullPath.replace(/\{[^}]+\}/g, '[^/]+').replace(/:[^/]+/g, '[^/]+');
                routeMatchers.push({
                    nodeId,
                    prefix: fullPath,
                    regex: new RegExp(`^${regexStr}`),
                });
            }
        } else {
            const regexStr = ctrl.base.replace(/\{[^}]+\}/g, '[^/]+').replace(/:[^/]+/g, '[^/]+');
            routeMatchers.push({
                nodeId,
                prefix: ctrl.base,
                regex: new RegExp(`^${regexStr}`),
            });
        }
    }

    for (const [nodeId, mount] of Object.entries(routerMounts)) {
        const regexStr = mount.replace(/\{[^}]+\}/g, '[^/]+').replace(/:[^/]+/g, '[^/]+');
        routeMatchers.push({
            nodeId,
            prefix: mount,
            regex: new RegExp(`^${regexStr}`),
        });
    }

    routeMatchers.sort((a, b) => b.prefix.length - a.prefix.length);

    const nodeEndpoints = new Map<string, Map<string, { count: number; p95: number; errors: number }>>();

    const errorsByRoute = new Map<string, number>();
    for (const err of rawData.errors) {
        const routeMatch = err.culprit.match(/((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+)?(\/api\/\S+)/);
        if (routeMatch) {
            const route = routeMatch[2];
            errorsByRoute.set(route, (errorsByRoute.get(route) || 0) + err.count);
        }
    }

    for (const txn of rawData.transactions) {
        const route = txn.transaction.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '');
        for (const matcher of routeMatchers) {
            if (matcher.regex.test(route)) {
                if (!nodeEndpoints.has(matcher.nodeId)) nodeEndpoints.set(matcher.nodeId, new Map());
                const endpoints = nodeEndpoints.get(matcher.nodeId)!;
                const existing = endpoints.get(txn.transaction) || { count: 0, p95: 0, errors: 0 };
                existing.count += txn.count;
                existing.p95 = Math.max(existing.p95, txn.p95);
                let matchedErrors = 0;
                for (const [errRoute, errCount] of errorsByRoute) {
                    if (matcher.regex.test(errRoute)) {
                        matchedErrors += errCount;
                    }
                }
                existing.errors += matchedErrors;
                endpoints.set(txn.transaction, existing);
                break;
            }
        }
    }

    const serviceSpans = new Map<string, Array<{ name: string; count: number }>>();
    for (const span of rawData.spans) {
        const dotIdx = span.transaction.indexOf('.');
        if (dotIdx < 0) continue;
        const serviceName = span.transaction.slice(0, dotIdx);
        const methodName = span.transaction.slice(dotIdx + 1);
        if (!serviceSpans.has(serviceName)) serviceSpans.set(serviceName, []);
        serviceSpans.get(serviceName)!.push({ name: methodName, count: span.count });
    }

    const nodeTopErrors = new Map<string, { title: string; count: number; issueId: string | null; groupId: string | null; transaction: string }>();
    for (const et of rawData.errorTitles) {
        const route = et.transaction.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '');
        if (!route.includes('/api/')) continue;
        for (const matcher of routeMatchers) {
            if (matcher.regex.test(route)) {
                const existing = nodeTopErrors.get(matcher.nodeId);
                if (!existing || et.count > existing.count) {
                    nodeTopErrors.set(matcher.nodeId, { title: et.title, count: et.count, issueId: et.issueId, groupId: et.groupId, transaction: et.transaction });
                }
                break;
            }
        }
    }

    let matchedCount = 0;
    for (const node of graph.nodes) {
        if (node.type === 'controller' || node.type === 'router') {
            const endpoints = nodeEndpoints.get(node.id);
            if (endpoints && endpoints.size > 0) {
                const endpointList: SentryEndpoint[] = [];
                let totalRequests = 0;
                let totalErrors = 0;
                let maxP95 = 0;

                for (const [route, data] of endpoints) {
                    endpointList.push({ route, count: data.count, p95Ms: data.p95, errorCount: data.errors });
                    totalRequests += data.count;
                    totalErrors += data.errors;
                    maxP95 = Math.max(maxP95, data.p95);
                }

                endpointList.sort((a, b) => b.count - a.count);

                const topErr = nodeTopErrors.get(node.id);
                node.sentryActivity = {
                    totalRequests,
                    totalErrors,
                    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
                    maxP95Ms: maxP95,
                    endpoints: endpointList.slice(0, 5),
                    spans: [],
                    topError: topErr?.title ?? null,
                    topErrorCount: topErr?.count ?? 0,
                    topErrorIssueId: topErr?.issueId ?? null,
                    topErrorGroupId: topErr?.groupId ?? null,
                    topErrorTransaction: topErr?.transaction ?? null,
                };
                matchedCount++;
            }
        } else if (node.type === 'service') {
            const spans = serviceSpans.get(node.id);
            if (spans && spans.length > 0) {
                spans.sort((a, b) => b.count - a.count);
                const totalRequests = spans.reduce((sum, s) => sum + s.count, 0);
                node.sentryActivity = {
                    totalRequests,
                    totalErrors: 0,
                    errorRate: 0,
                    maxP95Ms: 0,
                    endpoints: [],
                    spans: spans.slice(0, 5),
                    topError: null,
                    topErrorCount: 0,
                    topErrorIssueId: null,
                    topErrorGroupId: null,
                    topErrorTransaction: null,
                };
                matchedCount++;
            }
        }
    }

    console.log(`Matched Sentry data to ${matchedCount} nodes.`);
}

export function collectSentryActivity(graph: GraphData, forceRefresh: boolean): void {
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) {
        console.warn('Warning: SENTRY_AUTH_TOKEN not set. Skipping Sentry data. Set it to include production traffic metrics.');
        return;
    }

    const { data: cached, fromCache } = withCache<{ nodeData: Record<string, SentryActivity> }>({
        cachePath: SENTRY_CACHE,
        label: 'Sentry',
        force: forceRefresh,
        ttlMs: SENTRY_CACHE_TTL,
        compute: () => {
            const controllerRoutes = parseControllerRoutes();
            const routerMounts = parseRouterMountPaths();
            const rawData = fetchSentryData(token);
            matchSentryToNodes(rawData, graph, controllerRoutes, routerMounts);

            const nodeData: Record<string, SentryActivity> = {};
            for (const node of graph.nodes) {
                if (node.sentryActivity) {
                    nodeData[node.id] = node.sentryActivity;
                }
            }

            return { nodeData };
        },
    });

    if (fromCache) {
        for (const node of graph.nodes) {
            if (cached.nodeData[node.id]) {
                node.sentryActivity = cached.nodeData[node.id];
            }
        }
    }
}
