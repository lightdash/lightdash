export interface ServiceDeps {
    models: string[];
    clients: string[];
    services: string[];
}

export interface EeParsed {
    services: Record<string, ServiceDeps>;
    modelNames: string[];
    clientNames: string[];
}

export interface Complexity {
    cyclomatic: number;
    cognitive: number;
    maxFunctionCyclomatic: number;
}

export interface RecentCommit {
    hash: string;
    message: string;
    author: string;
    relativeDate: string;
}

export interface GitActivity {
    commits: number;
    authors: number;
    churn: number;
    recentCommits: RecentCommit[];
}

export interface NodeDuplication {
    clonedLines: number;
    totalLines: number;
    ratio: number;
}

export interface SentryEndpoint {
    route: string;
    count: number;
    p95Ms: number;
    errorCount: number;
}

export interface SentryActivity {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    maxP95Ms: number;
    endpoints: SentryEndpoint[];
    spans: Array<{ name: string; count: number }>;
    topError: string | null;
    topErrorCount: number;
    topErrorIssueId: string | null;
    topErrorGroupId: string | null;
    topErrorTransaction: string | null;
}

export interface SchedulerDeps {
    services: string[];
    clients: string[];
}

export interface AdapterInfo {
    parent: string | null;
}

export interface GraphNode {
    id: string;
    type: 'controller' | 'router' | 'service' | 'model' | 'client' | 'scheduler' | 'entity' | 'adapter' | 'middleware' | 'analytics';
    ee?: boolean;
    domain?: string;
    lineCount?: number;
    complexity?: Complexity;
    gitActivity?: GitActivity;
    gitSummary?: string;
    healthSummary?: string;
    duplication?: NodeDuplication;
    duplicationSummary?: string;
    sentryActivity?: SentryActivity;
}

export interface GraphEdge {
    from: string;
    to: string;
    type: string;
    duplication?: {
        cloneCount: number;
        totalLines: number;
        advice?: string;
        fragments: Array<{
            lines: number;
            fragment: string;
            firstStart: number;
            firstEnd: number;
            secondStart: number;
            secondEnd: number;
        }>;
    };
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: {
        controllers: number;
        routers: number;
        services: number;
        models: number;
        clients: number;
        schedulers: number;
        entities: number;
        adapters: number;
        middlewares: number;
        analytics: number;
        totalEdges: number;
    };
}

export interface ControllerRoute {
    base: string;
    subPaths: string[];
}

export interface SentryRawData {
    transactions: Array<{ transaction: string; count: number; p95: number }>;
    errors: Array<{ culprit: string; count: number }>;
    spans: Array<{ transaction: string; count: number }>;
    errorTitles: Array<{ title: string; transaction: string; count: number; issueId: string | null; groupId: string | null }>;
}

export interface JscpdClone {
    format: string;
    lines: number;
    fragment: string;
    firstFile: { name: string; start: number; end: number; startLoc: { line: number }; endLoc: { line: number } };
    secondFile: { name: string; start: number; end: number; startLoc: { line: number }; endLoc: { line: number } };
}
