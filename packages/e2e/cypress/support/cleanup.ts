/// <reference types="cypress" />

// Tracks content created during a spec (via UI or cy.request) and deletes it
// after the spec, so preview envs stay clean without a full DB reset.
const created: string[] = [];

type Matcher = {
    url: RegExp;
    deleteUrl: (match: RegExpMatchArray, results: AnyResults) => string | null;
};

type AnyResults = {
    uuid?: string;
    savedSqlUuid?: string;
    project?: { projectUuid?: string };
};

const MATCHERS: Matcher[] = [
    {
        url: /\/api\/v1\/projects\/([^/?]+)\/spaces\/?(\?.*)?$/,
        deleteUrl: (m, r) =>
            r.uuid ? `/api/v1/projects/${m[1]}/spaces/${r.uuid}` : null,
    },
    {
        url: /\/api\/v1\/projects\/[^/?]+\/dashboards(\/with-charts)?\/?(\?.*)?$/,
        deleteUrl: (_m, r) => (r.uuid ? `/api/v1/dashboards/${r.uuid}` : null),
    },
    {
        url: /\/api\/v1\/projects\/[^/?]+\/saved\/?(\?.*)?$/,
        deleteUrl: (_m, r) => (r.uuid ? `/api/v1/saved/${r.uuid}` : null),
    },
    {
        url: /\/api\/v1\/projects\/([^/?]+)\/sqlRunner\/saved\/?$/,
        deleteUrl: (m, r) =>
            r.savedSqlUuid
                ? `/api/v1/projects/${m[1]}/sqlRunner/saved/${r.savedSqlUuid}`
                : null,
    },
    {
        url: /\/api\/v1\/org\/projects\/?$/,
        deleteUrl: (_m, r) =>
            r.project?.projectUuid
                ? `/api/v1/org/projects/${r.project.projectUuid}`
                : null,
    },
];

const track = (method: string, url: string, body: unknown) => {
    if (method.toUpperCase() !== 'POST') return;
    const results =
        body && typeof body === 'object' && 'results' in body
            ? (body as { results: AnyResults }).results
            : null;
    if (!results || typeof results !== 'object') return;
    for (const matcher of MATCHERS) {
        const match = url.match(matcher.url);
        if (match) {
            const deleteUrl = matcher.deleteUrl(match, results);
            if (deleteUrl) created.push(deleteUrl);
            return;
        }
    }
};

// Browser-originated requests
beforeEach(() => {
    for (const matcher of MATCHERS) {
        cy.intercept({ method: 'POST', url: matcher.url }, (req) => {
            req.continue((res) => {
                track(req.method, req.url, res.body);
            });
        });
    }
});

// cy.request-originated requests
const requestMethodAndUrl = (
    args: unknown[],
): { method: string; url: string } => {
    const [first, second] = args;
    if (typeof first === 'object' && first !== null) {
        const options = first as Partial<Cypress.RequestOptions>;
        return { method: options.method ?? 'GET', url: String(options.url) };
    }
    if (typeof second === 'string') {
        return { method: String(first), url: second };
    }
    return { method: 'GET', url: String(first) };
};

Cypress.Commands.overwrite('request', (originalFn, ...args) => {
    const { method, url } = requestMethodAndUrl(args);
    return (originalFn as (...a: unknown[]) => Cypress.Chainable)(...args).then(
        (resp: Cypress.Response<unknown>) => {
            track(method, url, resp.body);
            return resp;
        },
    );
});

after(() => {
    if (created.length === 0) return;
    cy.login();
    // Reverse order so children go before parents; 404s are fine (cascades, tests deleting their own content)
    created
        .splice(0)
        .reverse()
        .forEach((url) => {
            cy.request({
                method: 'DELETE',
                url,
                failOnStatusCode: false,
                log: false,
            });
        });
});
