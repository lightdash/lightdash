import {
    assertUnreachable,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_PROJECT,
} from '@lightdash/common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
    access,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import * as YAML from 'yaml';

const SITE_URL = process.env.SITE_URL ?? 'http://127.0.0.1:3000';
const PROJECT_UUID = SEED_PROJECT.project_uuid;
const SEED_CHART_SLUG = 'what-s-the-average-spend-per-customer';
const SEED_DASHBOARD_SLUG = 'jaffle-dashboard';
const SEED_SPACE_SLUG = 'jaffle-shop';
const PROCESS_TIMEOUT_MS = 300_000;
const CLI_ENTRY = path.resolve(__dirname, '../../dist/index.js');
const CHART_FIXTURE = path.resolve(
    __dirname,
    '../../../api-tests/fixtures/chartAsCode.yml',
);
const EXPECTED_DASHBOARD_CHART_FILES = [
    'how-many-orders-we-have-over-time.yml',
    'how-much-revenue-do-we-have-per-payment-method.yml',
    'what-s-our-total-revenue-to-date.yml',
    'what-s-the-average-spend-per-customer.yml',
    'which-customers-have-not-recently-ordered-an-item.yml',
];

type JsonRecord = Record<string, unknown>;

type ApiResponse = {
    status: number;
    body: unknown;
};

type CliResult = {
    stdout: string;
    stderr: string;
};

type ContentReference =
    | {
          contentType: 'chart';
          source: 'dbt_explore' | 'sql';
          uuid: string;
          name: string;
      }
    | {
          contentType: 'dashboard';
          uuid: string;
          name: string;
      };

type TrackedResource =
    | {
          kind: 'chart';
          name: string;
          uuid: string | null;
      }
    | {
          kind: 'sqlChart';
          name: string;
          uuid: string | null;
      }
    | {
          kind: 'dashboard';
          name: string;
          uuid: string | null;
      };

type SeedState = {
    chart: JsonRecord;
    dashboard: JsonRecord;
    space: JsonRecord;
};

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getRequiredRecord = (value: unknown, label: string): JsonRecord => {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
};

const getRequiredString = (record: JsonRecord, key: string): string => {
    const value = record[key];
    if (typeof value !== 'string') {
        throw new Error(`${key} must be a string`);
    }
    return value;
};

const getRequiredArray = (record: JsonRecord, key: string): unknown[] => {
    const value = record[key];
    if (!Array.isArray(value)) {
        throw new Error(`${key} must be an array`);
    }
    return value;
};

const parseJson = (text: string, label: string): unknown => {
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not parse ${label}: ${message}`);
    }
};

const getResults = (body: unknown): unknown => {
    const response = getRequiredRecord(body, 'API response');
    if (response.status !== 'ok') {
        throw new Error(`API response status was ${String(response.status)}`);
    }
    return response.results;
};

class ApiClient {
    private cookie: string | null = null;

    async login(): Promise<void> {
        const response = await this.request(
            'POST',
            '/api/v1/login',
            {
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            },
            true,
        );
        if (response.status !== 200) {
            throw new Error(
                `Admin login failed with status ${response.status}`,
            );
        }
    }

    async get(apiPath: string, allowFailure = false): Promise<ApiResponse> {
        return this.request('GET', apiPath, undefined, allowFailure);
    }

    async post(
        apiPath: string,
        body: unknown,
        allowFailure = false,
    ): Promise<ApiResponse> {
        return this.request('POST', apiPath, body, allowFailure);
    }

    async delete(apiPath: string, allowFailure = false): Promise<ApiResponse> {
        return this.request('DELETE', apiPath, undefined, allowFailure);
    }

    private async request(
        method: 'GET' | 'POST' | 'DELETE',
        apiPath: string,
        body: unknown,
        allowFailure: boolean,
    ): Promise<ApiResponse> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (this.cookie !== null) {
            headers.Cookie = this.cookie;
        }

        const response = await fetch(new URL(apiPath, SITE_URL), {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: 'manual',
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie !== null) {
            const [cookie] = setCookie.split(';');
            if (cookie !== undefined && cookie.length > 0) {
                this.cookie = cookie;
            }
        }

        const text = await response.text();
        const responseBody =
            text.length === 0
                ? null
                : parseJson(text, `${method} ${apiPath} response`);
        if (!response.ok && !allowFailure) {
            throw new Error(
                `${method} ${apiPath} failed with status ${response.status}: ${text}`,
            );
        }
        return { status: response.status, body: responseBody };
    }
}

const parseYamlRecord = async (filePath: string): Promise<JsonRecord> => {
    const content = await readFile(filePath, 'utf8');
    const parsed: unknown = YAML.parse(content);
    return getRequiredRecord(parsed, filePath);
};

const writeYamlRecord = async (
    filePath: string,
    value: JsonRecord,
): Promise<void> => {
    await writeFile(filePath, YAML.stringify(value), 'utf8');
};

const listYamlFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.endsWith('.yml') &&
                !entry.name.endsWith('.language.map.yml') &&
                !entry.name.endsWith('.space.yml'),
        )
        .map((entry) => entry.name)
        .sort();
};

const getCodeItem = async (
    client: ApiClient,
    resource: 'charts' | 'dashboards',
    slug: string,
): Promise<JsonRecord> => {
    const response = await client.get(
        `/api/v1/projects/${PROJECT_UUID}/code/${resource}?ids=${encodeURIComponent(slug)}`,
    );
    const results = getRequiredRecord(getResults(response.body), resource);
    const items = getRequiredArray(results, resource);
    const matching = items.filter(
        (item) => isRecord(item) && item.slug === slug,
    );
    if (matching.length !== 1) {
        throw new Error(
            `Expected one ${resource} item for ${slug}, found ${matching.length}`,
        );
    }
    return getRequiredRecord(matching[0], `${resource} item`);
};

const getSpaceItem = async (
    client: ApiClient,
    slug: string,
): Promise<JsonRecord> => {
    const response = await client.get(
        `/api/v1/projects/${PROJECT_UUID}/code/spaces`,
    );
    const results = getRequiredRecord(getResults(response.body), 'spaces');
    const spaces = getRequiredArray(results, 'spaces');
    const matching = spaces.filter(
        (space) => isRecord(space) && space.slug === slug,
    );
    if (matching.length !== 1) {
        throw new Error(
            `Expected one space item for ${slug}, found ${matching.length}`,
        );
    }
    return getRequiredRecord(matching[0], 'space item');
};

const withoutDownloadTimestamp = (item: JsonRecord): JsonRecord =>
    Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== 'downloadedAt'),
    );

const captureSeedState = async (client: ApiClient): Promise<SeedState> => ({
    chart: withoutDownloadTimestamp(
        await getCodeItem(client, 'charts', SEED_CHART_SLUG),
    ),
    dashboard: withoutDownloadTimestamp(
        await getCodeItem(client, 'dashboards', SEED_DASHBOARD_SLUG),
    ),
    space: await getSpaceItem(client, SEED_SPACE_SLUG),
});

const parseContentReference = (value: unknown): ContentReference => {
    const item = getRequiredRecord(value, 'content item');
    const contentType = getRequiredString(item, 'contentType');
    const uuid = getRequiredString(item, 'uuid');
    const name = getRequiredString(item, 'name');

    switch (contentType) {
        case 'chart': {
            const source = getRequiredString(item, 'source');
            switch (source) {
                case 'dbt_explore':
                case 'sql':
                    return { contentType, source, uuid, name };
                default:
                    throw new Error(`Unexpected chart source ${source}`);
            }
        }
        case 'dashboard':
            return { contentType, uuid, name };
        default:
            throw new Error(`Unexpected content type ${contentType}`);
    }
};

const findContentByExactName = async (
    client: ApiClient,
    name: string,
): Promise<ContentReference[]> => {
    const params = new URLSearchParams({
        projectUuids: PROJECT_UUID,
        page: '1',
        pageSize: '100',
        search: name,
    });
    params.append('contentTypes', 'chart');
    params.append('contentTypes', 'dashboard');
    const response = await client.get(`/api/v2/content?${params.toString()}`);
    const results = getRequiredRecord(getResults(response.body), 'content');
    return getRequiredArray(results, 'data')
        .map(parseContentReference)
        .filter((item) => item.name === name);
};

const deleteContentReference = async (
    client: ApiClient,
    item: ContentReference,
): Promise<void> => {
    switch (item.contentType) {
        case 'dashboard':
            await client.delete(`/api/v1/dashboards/${item.uuid}`, true);
            break;
        case 'chart': {
            const { source } = item;
            switch (source) {
                case 'dbt_explore':
                    await client.delete(`/api/v1/saved/${item.uuid}`, true);
                    break;
                case 'sql':
                    await client.delete(
                        `/api/v1/projects/${PROJECT_UUID}/sqlRunner/saved/${item.uuid}`,
                        true,
                    );
                    break;
                default:
                    assertUnreachable(source, 'Unexpected chart source');
            }
            break;
        }
        default:
            assertUnreachable(item, 'Unexpected content type');
    }
};

const deleteTrackedUuid = async (
    client: ApiClient,
    resource: TrackedResource,
): Promise<void> => {
    if (resource.uuid === null) {
        return;
    }
    switch (resource.kind) {
        case 'chart':
            await client.delete(`/api/v1/saved/${resource.uuid}`, true);
            break;
        case 'sqlChart':
            await client.delete(
                `/api/v1/projects/${PROJECT_UUID}/sqlRunner/saved/${resource.uuid}`,
                true,
            );
            break;
        case 'dashboard':
            await client.delete(`/api/v1/dashboards/${resource.uuid}`, true);
            break;
        default:
            assertUnreachable(resource, 'Unexpected tracked resource');
    }
};

const setMetadataDownloadedAt = async (
    cwd: string,
    slug: string,
    downloadedAt: string,
): Promise<void> => {
    const metadataPath = path.join(
        cwd,
        'lightdash',
        '.lightdash-metadata.json',
    );
    const metadata = getRequiredRecord(
        parseJson(await readFile(metadataPath, 'utf8'), metadataPath),
        'metadata',
    );
    const charts = getRequiredRecord(metadata.charts, 'metadata charts');
    if (typeof charts[slug] !== 'string') {
        throw new Error(`Metadata has no chart timestamp for ${slug}`);
    }
    charts[slug] = downloadedAt;
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
};

describe.sequential('Content as Code CLI', () => {
    const runId = randomUUID();
    const slugId = runId.replaceAll('-', '');
    const patDescription = `content-as-code-cli-${runId}`;
    const trackedResources: TrackedResource[] = [];
    let suiteRoot = '';
    let homeDirectory = '';
    let cwd = '';
    let admin: ApiClient | null = null;
    let patUuid: string | null = null;
    let patToken: string | null = null;
    let seedState: SeedState | null = null;

    const runCli = async (args: string[]): Promise<CliResult> => {
        if (cwd.length === 0 || homeDirectory.length === 0) {
            throw new Error('CLI filesystem isolation is not initialized');
        }
        return new Promise((resolve, reject) => {
            execFile(
                process.execPath,
                [CLI_ENTRY, ...args],
                {
                    cwd,
                    env: {
                        ...process.env,
                        HOME: homeDirectory,
                        CI: 'true',
                        NODE_ENV: 'development',
                        FORCE_COLOR: '0',
                    },
                    timeout: PROCESS_TIMEOUT_MS,
                    maxBuffer: 10 * 1024 * 1024,
                },
                (error, stdout, stderr) => {
                    if (error !== null) {
                        reject(
                            new Error(
                                `CLI process failed (exit ${String(error.code)}, signal ${String(error.signal)}):\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                            ),
                        );
                        return;
                    }
                    resolve({ stdout, stderr });
                },
            );
        });
    };

    const trackResource = (
        kind: TrackedResource['kind'],
        name: string,
    ): TrackedResource => {
        let resource: TrackedResource;
        switch (kind) {
            case 'chart':
                resource = { kind, name, uuid: null };
                break;
            case 'sqlChart':
                resource = { kind, name, uuid: null };
                break;
            case 'dashboard':
                resource = { kind, name, uuid: null };
                break;
            default:
                return assertUnreachable(kind, 'Unexpected resource kind');
        }
        trackedResources.push(resource);
        return resource;
    };

    const setTrackedUuid = (
        resource: TrackedResource,
        uuid: string,
    ): TrackedResource => {
        const index = trackedResources.indexOf(resource);
        if (index < 0) {
            throw new Error(`Resource ${resource.name} is not tracked`);
        }
        const updatedResource = { ...resource, uuid };
        trackedResources[index] = updatedResource;
        return updatedResource;
    };

    const captureCreatedResource = async (
        resource: TrackedResource,
    ): Promise<ContentReference> => {
        if (admin === null) {
            throw new Error('API client is not initialized');
        }
        const matches = await findContentByExactName(admin, resource.name);
        const expectedMatches = matches.filter((match) => {
            switch (resource.kind) {
                case 'chart':
                    return (
                        match.contentType === 'chart' &&
                        match.source === 'dbt_explore'
                    );
                case 'sqlChart':
                    return (
                        match.contentType === 'chart' && match.source === 'sql'
                    );
                case 'dashboard':
                    return match.contentType === 'dashboard';
                default:
                    return assertUnreachable(
                        resource,
                        'Unexpected tracked resource',
                    );
            }
        });
        expect(expectedMatches).toHaveLength(1);
        const [created] = expectedMatches;
        if (created === undefined) {
            throw new Error(
                `Could not capture created resource ${resource.name}`,
            );
        }
        setTrackedUuid(resource, created.uuid);
        return created;
    };

    const createSqlChart = async (input: {
        name: string;
        slug: string;
        description: string;
        sql: string;
    }): Promise<{ filePath: string; uuid: string }> => {
        const resource = trackResource('sqlChart', input.name);
        const filePath = path.join(
            cwd,
            'lightdash',
            'charts',
            `${input.slug}.sql.yml`,
        );
        await writeYamlRecord(filePath, {
            name: input.name,
            description: input.description,
            slug: input.slug,
            sql: input.sql,
            limit: 500,
            config: {
                type: 'table',
                display: {},
                metadata: { version: 1 },
                columns: {},
            },
            chartKind: 'table',
            spaceSlug: SEED_SPACE_SLUG,
            version: 1,
            updatedAt: new Date().toISOString(),
            downloadedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        });
        const upload = await runCli(['upload', '--verbose']);
        expect(upload.stdout).toContain('charts created: 1');
        const created = await captureCreatedResource(resource);
        return { filePath, uuid: created.uuid };
    };

    beforeAll(async () => {
        await Promise.all([access(CLI_ENTRY), access(CHART_FIXTURE)]);
        suiteRoot = await mkdtemp(
            path.join(tmpdir(), 'lightdash-content-as-code-'),
        );
        homeDirectory = path.join(suiteRoot, 'home');
        cwd = path.join(suiteRoot, 'setup');
        await Promise.all([
            mkdir(homeDirectory, { recursive: true }),
            mkdir(cwd, { recursive: true }),
        ]);

        admin = new ApiClient();
        await admin.login();
        seedState = await captureSeedState(admin);

        const patResponse = await admin.post(
            '/api/v1/user/me/personal-access-tokens',
            {
                description: patDescription,
                autoGenerated: true,
                expiresAt: null,
            },
        );
        const pat = getRequiredRecord(getResults(patResponse.body), 'PAT');
        patUuid = getRequiredString(pat, 'uuid');
        patToken = getRequiredString(pat, 'token');

        const loginResult = await runCli([
            'login',
            SITE_URL,
            '--token',
            patToken,
            '--project',
            PROJECT_UUID,
        ]);
        expect(loginResult.stderr).toContain('Login successful');
        await rm(cwd, { recursive: true, force: true });
        cwd = '';
    });

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(suiteRoot, 'case-'));
    });

    afterEach(async () => {
        if (cwd.length > 0) {
            await rm(cwd, { recursive: true, force: true });
            cwd = '';
        }
    });

    afterAll(async () => {
        const failures: string[] = [];
        const captureFailure = async (
            label: string,
            task: () => Promise<void>,
        ): Promise<void> => {
            try {
                await task();
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                failures.push(`${label}: ${message}`);
            }
        };

        if (admin !== null) {
            const client = admin;
            await captureFailure('content UUID cleanup', async () => {
                await Promise.all(
                    trackedResources.map((resource) =>
                        deleteTrackedUuid(client, resource),
                    ),
                );
            });
            await captureFailure('content exact-name cleanup', async () => {
                const matches = await Promise.all(
                    trackedResources.map((resource) =>
                        findContentByExactName(client, resource.name),
                    ),
                );
                await Promise.all(
                    matches
                        .flat()
                        .map((item) => deleteContentReference(client, item)),
                );
                const remaining = await Promise.all(
                    trackedResources.map((resource) =>
                        findContentByExactName(client, resource.name),
                    ),
                );
                expect(remaining.flat()).toHaveLength(0);
            });
            await captureFailure('PAT cleanup', async () => {
                if (patUuid !== null) {
                    await client.delete(
                        `/api/v1/user/me/personal-access-tokens/${patUuid}`,
                        true,
                    );
                }
                const listResponse = await client.get(
                    '/api/v1/user/me/personal-access-tokens',
                );
                const tokens = getResults(listResponse.body);
                if (!Array.isArray(tokens)) {
                    throw new Error('PAT list results must be an array');
                }
                const matchingTokens = tokens.filter(
                    (token) =>
                        isRecord(token) &&
                        token.description === patDescription &&
                        typeof token.uuid === 'string',
                );
                await Promise.all(
                    matchingTokens.map((token) =>
                        client.delete(
                            `/api/v1/user/me/personal-access-tokens/${getRequiredString(token, 'uuid')}`,
                            true,
                        ),
                    ),
                );
                const verifyResponse = await client.get(
                    '/api/v1/user/me/personal-access-tokens',
                );
                const remainingTokens = getResults(verifyResponse.body);
                if (!Array.isArray(remainingTokens)) {
                    throw new Error(
                        'PAT verification results must be an array',
                    );
                }
                expect(
                    remainingTokens.filter(
                        (token) =>
                            isRecord(token) &&
                            token.description === patDescription,
                    ),
                ).toHaveLength(0);
            });
            await captureFailure('seed state verification', async () => {
                if (seedState === null) {
                    throw new Error('Seed state was not captured');
                }
                expect(await captureSeedState(client)).toEqual(seedState);
            });
        }

        await captureFailure('temporary root cleanup', async () => {
            if (suiteRoot.length > 0) {
                await rm(suiteRoot, { recursive: true, force: true });
                await expect(access(suiteRoot)).rejects.toThrow();
            }
        });

        if (failures.length > 0) {
            throw new Error(failures.join('\n'));
        }
    });

    it('downloads charts and dashboards as code', async () => {
        await runCli(['download']);
        const [chartFiles, dashboardFiles] = await Promise.all([
            listYamlFiles(path.join(cwd, 'lightdash', 'charts')),
            listYamlFiles(path.join(cwd, 'lightdash', 'dashboards')),
        ]);
        expect(chartFiles.length).toBeGreaterThan(0);
        expect(dashboardFiles.length).toBeGreaterThan(0);
    });

    it('downloads a dashboard and its five linked charts by slug', async () => {
        await runCli([
            'download',
            '-c',
            SEED_CHART_SLUG,
            '-d',
            SEED_DASHBOARD_SLUG,
        ]);
        const [chartFiles, dashboardFiles] = await Promise.all([
            listYamlFiles(path.join(cwd, 'lightdash', 'charts')),
            listYamlFiles(path.join(cwd, 'lightdash', 'dashboards')),
        ]);
        expect(chartFiles).toEqual(EXPECTED_DASHBOARD_CHART_FILES);
        expect(dashboardFiles).toEqual([`${SEED_DASHBOARD_SLUG}.yml`]);
    });

    it('uploads a modified chart', async () => {
        if (admin === null) {
            throw new Error('API client is not initialized');
        }
        const name = `CAC CLI regular chart [${runId}]`;
        const slug = `cac-cli-regular-${slugId}`;
        const resource = trackResource('chart', name);
        const fixture = await parseYamlRecord(CHART_FIXTURE);
        fixture.name = name;
        fixture.slug = slug;
        fixture.description = 'Original CLI integration description';
        fixture.skipSpaceCreate = true;

        const createResponse = await admin.post(
            `/api/v1/projects/${PROJECT_UUID}/code/charts/${slug}`,
            fixture,
        );
        const changes = getRequiredRecord(
            getResults(createResponse.body),
            'chart create changes',
        );
        const chartChanges = getRequiredArray(changes, 'charts');
        const createdChange = getRequiredRecord(
            chartChanges[0],
            'created chart change',
        );
        expect(createdChange.action).toBe('create');
        const createdChart = getRequiredRecord(
            createdChange.data,
            'created chart',
        );
        const chartUuid = getRequiredString(createdChart, 'uuid');
        setTrackedUuid(resource, chartUuid);

        await runCli(['download']);
        const chartPath = path.join(cwd, 'lightdash', 'charts', `${slug}.yml`);
        const updatedDescription = `Updated by CLI integration ${runId}`;
        const chart = await parseYamlRecord(chartPath);
        chart.description = updatedDescription;
        await writeYamlRecord(chartPath, chart);
        await setMetadataDownloadedAt(
            cwd,
            slug,
            new Date(Date.now() - 5 * 60_000).toISOString(),
        );

        const upload = await runCli(['upload', '--verbose']);
        expect(upload.stdout).toContain('charts updated: 1');

        const verifyResponse = await admin.get(`/api/v1/saved/${chartUuid}`);
        const verifiedChart = getRequiredRecord(
            getResults(verifyResponse.body),
            'verified chart',
        );
        expect(verifiedChart.description).toBe(updatedDescription);
    });

    it('creates a dashboard after changing only its slug', async () => {
        if (admin === null) {
            throw new Error('API client is not initialized');
        }
        const name = `CAC CLI dashboard [${runId}]`;
        const slug = `cac-cli-dashboard-${slugId}`;
        const sourceResource = trackResource('dashboard', name);
        const createResponse = await admin.post(
            `/api/v1/projects/${PROJECT_UUID}/dashboards`,
            { name, tiles: [], tabs: [] },
        );
        expect(createResponse.status).toBe(201);
        const sourceDashboard = getRequiredRecord(
            getResults(createResponse.body),
            'source dashboard',
        );
        const sourceUuid = getRequiredString(sourceDashboard, 'uuid');
        const sourceSlug = getRequiredString(sourceDashboard, 'slug');
        setTrackedUuid(sourceResource, sourceUuid);
        const createdResource = trackResource('dashboard', name);

        await runCli(['download']);
        const dashboardPath = path.join(
            cwd,
            'lightdash',
            'dashboards',
            `${sourceSlug}.yml`,
        );
        const dashboard = await parseYamlRecord(dashboardPath);
        dashboard.slug = slug;
        await writeYamlRecord(dashboardPath, dashboard);

        const upload = await runCli(['upload', '--verbose']);
        expect(upload.stdout).toContain('dashboards created: 1');
        const matches = (await findContentByExactName(admin, name)).filter(
            (item) =>
                item.contentType === 'dashboard' && item.uuid !== sourceUuid,
        );
        expect(matches).toHaveLength(1);
        const [created] = matches;
        if (created === undefined || created.contentType !== 'dashboard') {
            throw new Error(`Could not capture dashboard created from ${slug}`);
        }
        setTrackedUuid(createdResource, created.uuid);
        expect(created.name).toBe(name);
    });

    it('creates a SQL chart', async () => {
        await runCli(['download']);
        const name = `CAC CLI SQL create [${runId}]`;
        const slug = `cac-cli-sql-create-${slugId}`;
        const { uuid } = await createSqlChart({
            name,
            slug,
            description: 'A SQL chart created by the CLI integration test',
            sql: 'SELECT * FROM "postgres"."jaffle"."orders" LIMIT 5',
        });
        if (admin === null) {
            throw new Error('API client is not initialized');
        }
        const response = await admin.get(
            `/api/v1/projects/${PROJECT_UUID}/sqlRunner/saved/${uuid}`,
        );
        const sqlChart = getRequiredRecord(
            getResults(response.body),
            'created SQL chart',
        );
        expect(sqlChart.name).toBe(name);
    });

    it('downloads a SQL chart by slug with the SQL extension', async () => {
        await runCli(['download']);
        const name = `CAC CLI SQL download [${runId}]`;
        const slug = `cac-cli-sql-download-${slugId}`;
        await createSqlChart({
            name,
            slug,
            description: 'A SQL chart for the CLI download test',
            sql: 'SELECT * FROM "postgres"."jaffle"."payments" LIMIT 10',
        });

        await rm(path.join(cwd, 'lightdash'), {
            recursive: true,
            force: true,
        });
        await runCli(['download', '-c', slug]);
        await expect(
            access(path.join(cwd, 'lightdash', 'charts', `${slug}.sql.yml`)),
        ).resolves.toBeUndefined();
    });

    it('updates an existing SQL chart', async () => {
        await runCli(['download']);
        const name = `CAC CLI SQL update [${runId}]`;
        const slug = `cac-cli-sql-update-${slugId}`;
        const { filePath, uuid } = await createSqlChart({
            name,
            slug,
            description: 'Original SQL chart description',
            sql: 'SELECT * FROM "postgres"."jaffle"."orders" LIMIT 5',
        });
        const updatedDescription = `Updated SQL description ${runId}`;
        const sqlChart = await parseYamlRecord(filePath);
        sqlChart.description = updatedDescription;
        sqlChart.downloadedAt = new Date(Date.now() - 5 * 60_000).toISOString();
        await writeYamlRecord(filePath, sqlChart);

        const upload = await runCli(['upload', '--verbose']);
        expect(upload.stdout).toContain('charts updated: 1');
        if (admin === null) {
            throw new Error('API client is not initialized');
        }
        const response = await admin.get(
            `/api/v1/projects/${PROJECT_UUID}/sqlRunner/saved/${uuid}`,
        );
        const verifiedSqlChart = getRequiredRecord(
            getResults(response.body),
            'updated SQL chart',
        );
        expect(verifiedSqlChart.description).toBe(updatedDescription);
    });
});
