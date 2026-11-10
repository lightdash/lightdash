import { request } from '@playwright/test';
import { loginAs, SEED_USERS } from './api';

// Tracks content created during tests (via the UI or the `api` fixture) and deletes it
// when the worker exits, so preview envs stay clean without a full DB reset.
const created: string[] = [];

type Matcher = {
    method: 'POST' | 'GET';
    url: RegExp;
    deleteUrl: (match: RegExpMatchArray, results: AnyResults) => string | null;
};

type AnyResults = {
    uuid?: string;
    userUuid?: string;
    savedSqlUuid?: string;
    project?: { projectUuid?: string };
    jobResults?: { projectUuid?: string };
};

const MATCHERS: Matcher[] = [
    {
        method: 'POST',
        url: /api\/v1\/projects\/([^/?]+)\/spaces\/?(\?.*)?$/,
        deleteUrl: (m, r) =>
            r.uuid ? `/api/v1/projects/${m[1]}/spaces/${r.uuid}` : null,
    },
    {
        method: 'POST',
        url: /api\/v1\/projects\/[^/?]+\/dashboards(\/with-charts)?\/?(\?.*)?$/,
        deleteUrl: (_m, r) => (r.uuid ? `/api/v1/dashboards/${r.uuid}` : null),
    },
    {
        method: 'POST',
        url: /api\/v1\/projects\/[^/?]+\/saved\/?(\?.*)?$/,
        deleteUrl: (_m, r) => (r.uuid ? `/api/v1/saved/${r.uuid}` : null),
    },
    {
        method: 'POST',
        url: /api\/v1\/projects\/([^/?]+)\/sqlRunner\/saved\/?$/,
        deleteUrl: (m, r) =>
            r.savedSqlUuid
                ? `/api/v1/projects/${m[1]}/sqlRunner/saved/${r.savedSqlUuid}`
                : null,
    },
    {
        method: 'POST',
        url: /api\/v1\/user\/?$/,
        deleteUrl: (_m, r) =>
            r.userUuid ? `/api/v1/org/user/${r.userUuid}` : null,
    },
    {
        method: 'POST',
        url: /api\/v1\/org\/projects\/?$/,
        deleteUrl: (_m, r) =>
            r.project?.projectUuid
                ? `/api/v1/org/projects/${r.project.projectUuid}`
                : null,
    },
    {
        // UI creates projects through an async job; the uuid only shows up in the job status
        method: 'GET',
        url: /api\/v1\/jobs\/[^/?]+\/?$/,
        deleteUrl: (_m, r) =>
            r.jobResults?.projectUuid
                ? `/api/v1/org/projects/${r.jobResults.projectUuid}`
                : null,
    },
];

export const matchesTrackedRequest = (method: string, url: string) =>
    MATCHERS.some((m) => m.method === method.toUpperCase() && m.url.test(url));

export const trackCreated = (method: string, url: string, body: unknown) => {
    const results =
        body && typeof body === 'object' && 'results' in body
            ? (body as { results: AnyResults }).results
            : null;
    if (!results || typeof results !== 'object') return;
    const matcher = MATCHERS.find(
        (m) => m.method === method.toUpperCase() && m.url.test(url),
    );
    if (!matcher) return;
    const match = url.match(matcher.url);
    if (!match) return;
    const deleteUrl = matcher.deleteUrl(match, results);
    if (deleteUrl && !created.includes(deleteUrl)) created.push(deleteUrl);
};

export const deleteCreated = async (baseURL: string) => {
    if (created.length === 0) return;
    const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await loginAs(api, SEED_USERS.admin);
    // Reverse order so children go before parents; 404s are fine (cascades, tests deleting their own content)
    const urls = created.splice(0).reverse();
    for (const url of urls) {
        await api.delete(url);
    }
    await api.dispose();
};
