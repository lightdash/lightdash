import { type PreflightExplain, type PreflightProbe } from '@lightdash/common';
import fetch, { type Response } from 'node-fetch';
import { URL } from 'url';
import { getConfig, type Config } from '../config';
import { buildRequestHeaders } from '../handlers/utils';
import {
    type PreflightActivityRow,
    type PreflightLockRow,
    type PreflightStatRow,
} from './core';

type ProbePayload = PreflightProbe & {
    appliedMigrations?: Array<{
        name: string;
        batch: number;
        migrationTime: string;
    }>;
};

type ApiPreflightExplainResponse = {
    status: 'ok';
    results: PreflightExplain;
};

type ApiPreflightProbeResponse = {
    status: 'ok';
    results: ProbePayload;
};

export type ProbeFailure =
    | 'unauthorized'
    | 'forbidden'
    | 'disabled'
    | 'request';

export class PreflightProbeError extends Error {
    readonly failure: ProbeFailure;

    constructor(failure: ProbeFailure, message: string) {
        super(message);
        this.name = 'PreflightProbeError';
        this.failure = failure;
    }
}

export interface CoreProbeSnapshot {
    serverTime: string;
    lockRows: PreflightLockRow[] | null;
    lastMigrationAgeSeconds: number | null;
    statRows: PreflightStatRow[];
    activityRows: PreflightActivityRow[];
    appliedMigrations: string[] | null;
}

export interface ProbeSample {
    before: CoreProbeSnapshot;
    after: CoreProbeSnapshot;
}

export interface ProbeClientDependencies {
    fetch: typeof fetch;
    getConfig: () => Promise<Config>;
    sleep: (milliseconds: number) => Promise<void>;
}

const defaultDependencies: ProbeClientDependencies = {
    fetch,
    getConfig,
    sleep: (milliseconds) =>
        new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        }),
};

const errorMessageFromResponse = async (
    response: Response,
): Promise<string> => {
    const raw = await response.text();
    try {
        const body = JSON.parse(raw) as {
            error?: { message?: string };
            message?: string;
        };
        return body.error?.message ?? body.message ?? raw;
    } catch {
        return raw;
    }
};

const probeError = async (response: Response): Promise<PreflightProbeError> => {
    const serverMessage = await errorMessageFromResponse(response);
    if (response.status === 401) {
        return new PreflightProbeError(
            'unauthorized',
            "The Lightdash session is not authenticated or has expired. Run 'lightdash login' and retry preflight.",
        );
    }
    if (
        response.status === 404 ||
        serverMessage.includes('PREFLIGHT_PROBE_ENABLED') ||
        serverMessage.includes('not enabled')
    ) {
        return new PreflightProbeError(
            'disabled',
            'The preflight probe is unavailable. Set PREFLIGHT_PROBE_ENABLED=true on the Lightdash server, restart the instance, and retry preflight.',
        );
    }
    if (response.status === 403) {
        return new PreflightProbeError(
            'forbidden',
            'The preflight probe requires an organization-admin API key. Log in as an organization admin and retry preflight.',
        );
    }
    return new PreflightProbeError(
        'request',
        `The preflight probe failed with HTTP ${response.status}${serverMessage ? `: ${serverMessage}` : ''}`,
    );
};

export const mapProbeSnapshot = (probe: ProbePayload): CoreProbeSnapshot => ({
    serverTime: probe.serverTime,
    lockRows:
        probe.lock === null
            ? null
            : [{ index: 1, is_locked: probe.lock.isLocked ? 1 : 0 }],
    lastMigrationAgeSeconds: probe.lock?.lastMigrationAgeSeconds ?? null,
    statRows: probe.tableStats.map((table) => ({
        relname: table.table,
        n_tup_ins: table.inserts,
        n_tup_upd: table.updates,
        n_tup_del: table.deletes,
        n_live_tup: table.liveTuples,
    })),
    activityRows: probe.activity.map((activity) => ({
        pid: activity.pid,
        usename: activity.userName,
        application_name: activity.applicationName,
        state: activity.state,
        xact_age_s: activity.xactAgeSeconds,
        query: activity.query,
        blocked_by: activity.blockedBy.length === 0 ? null : activity.blockedBy,
    })),
    appliedMigrations: probe.appliedMigrations?.map(({ name }) => name) ?? null,
});

export const normalizeCounterResets = (
    before: CoreProbeSnapshot,
    after: CoreProbeSnapshot,
): CoreProbeSnapshot => {
    const beforeByTable = new Map(
        before.statRows.map((row) => [row.relname, row]),
    );
    return {
        ...after,
        statRows: after.statRows.map((row) => {
            const previous = beforeByTable.get(row.relname);
            if (previous === undefined) return row;
            return {
                ...row,
                n_tup_ins: Math.max(row.n_tup_ins, previous.n_tup_ins),
                n_tup_upd: Math.max(row.n_tup_upd, previous.n_tup_upd),
                n_tup_del: Math.max(row.n_tup_del, previous.n_tup_del),
            };
        }),
    };
};

const requestProbe = async (
    config: Config,
    tables: string[],
    request: typeof fetch,
): Promise<CoreProbeSnapshot> => {
    if (!(config.context?.apiKey && config.context.serverUrl)) {
        throw new PreflightProbeError(
            'unauthorized',
            "The Lightdash session is not authenticated. Run 'lightdash login' and retry preflight.",
        );
    }
    const url = new URL('/api/v1/preflight/probe', config.context.serverUrl);
    if (tables.length > 0) url.searchParams.set('tables', tables.join(','));
    const headers = buildRequestHeaders(config.context.apiKey);
    if (config.context.proxyAuthorization) {
        headers['Proxy-Authorization'] = config.context.proxyAuthorization;
    }
    const response = await request(url.href, { method: 'GET', headers });
    if (!response.ok) throw await probeError(response);
    const body = (await response.json()) as ApiPreflightProbeResponse;
    return mapProbeSnapshot(body.results);
};

/**
 * Returns null when this server has no EXPLAIN endpoint — the CLI and the server
 * version independently, so an older instance is a normal condition rather than
 * an error. The caller reports what it could not check.
 */
const requestExplain = async (
    config: Config,
    sql: string,
    request: typeof fetch,
): Promise<PreflightExplain | null> => {
    if (!(config.context?.apiKey && config.context.serverUrl)) {
        throw new PreflightProbeError(
            'unauthorized',
            "The Lightdash session is not authenticated. Run 'lightdash login' and retry preflight.",
        );
    }
    const url = new URL('/api/v1/preflight/explain', config.context.serverUrl);
    const headers = buildRequestHeaders(config.context.apiKey);
    headers['Content-Type'] = 'application/json';
    if (config.context.proxyAuthorization) {
        headers['Proxy-Authorization'] = config.context.proxyAuthorization;
    }
    const response = await request(url.href, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sql }),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw await probeError(response);
    const body = (await response.json()) as ApiPreflightExplainResponse;
    return body.results;
};

export const createProbeClient = (
    dependencies: ProbeClientDependencies = defaultDependencies,
) => ({
    explain: async (sql: string): Promise<PreflightExplain | null> => {
        const config = await dependencies.getConfig();
        return requestExplain(config, sql, dependencies.fetch);
    },
    sample: async (
        tables: string[],
        intervalSeconds: number,
    ): Promise<ProbeSample> => {
        const config = await dependencies.getConfig();
        const before = await requestProbe(config, tables, dependencies.fetch);
        await dependencies.sleep(intervalSeconds * 1000);
        const after = await requestProbe(config, tables, dependencies.fetch);
        return {
            before,
            after: normalizeCounterResets(before, after),
        };
    },
});
