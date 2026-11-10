import {
    SupportedDbtAdapter,
    type DataAppCodeDownload,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { runWithAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { writeFilesToDir } from './apps/appCodeFiles';
import { ensureDownloadedAppContext } from './apps/appsDownload';
import { resultsToCsv } from './asyncQuery';
import { lightdashApi } from './dbt/apiClient';
import { deploy } from './deploy';
import { downloadContent, testHelpers } from './download';
import { downloadHomepages } from './homepagesAsCode';
import { runChartHandler } from './runChart';
import { getProjectDeploySettings } from './timestampConversion';
import { warehouseCatalogHandler } from './warehouseCatalog';

vi.mock('./dbt/apiClient', async (original) => ({
    ...(await original<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('../lightdash-config', () => ({
    readAndLoadLightdashProjectConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({ context: { project: 'project' } }),
}));
vi.mock('../agentConnections/projectSelection', () => ({
    resolveAgentConnectionProject: vi.fn().mockResolvedValue('project'),
}));
const reply = (value: unknown) =>
    vi.mocked(lightdashApi).mockResolvedValue(value as never);
const replyOnce = (value: unknown) =>
    vi.mocked(lightdashApi).mockResolvedValueOnce(value as never);
const marker = 'X3 leak!';
const invalid = 'The server returned an invalid response.';
const selected = <T>(action: () => Promise<T>) =>
    runWithAgentConnectionSelection('default', action);
let directory: string;
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'connection-success-'));
    vi.clearAllMocks();
    vi.spyOn(GlobalState, 'log').mockImplementation(() => {});
    vi.spyOn(GlobalState, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
});
it.each(['offset', 'total'])(
    'rejects a mistyped download %s before progress',
    async (field) => {
        reply({
            offset: 0,
            total: 0,
            missingIds: [],
            charts: [],
            spaces: [],
            [field]: marker,
        });
        const progress = vi.fn();
        await expect(
            selected(() =>
                downloadContent(
                    [],
                    'charts',
                    'project',
                    'Project',
                    directory,
                    false,
                    false,
                    true,
                    false,
                    false,
                    progress,
                ),
            ),
        ).rejects.toThrow(invalid);
        expect(progress).not.toHaveBeenCalled();
    },
);
it('uses fixed missing-chart debug text', async () => {
    reply({
        offset: 0,
        total: 0,
        missingIds: [marker],
        charts: [],
        spaces: [],
    });
    await selected(() =>
        downloadContent(
            [],
            'charts',
            'project',
            'Project',
            directory,
            false,
            false,
            true,
        ),
    );
    expect(GlobalState.debug).toHaveBeenCalledWith(
        'Some requested items were not found.',
    );
    expect(
        JSON.stringify(vi.mocked(GlobalState.debug).mock.calls),
    ).not.toContain(marker);
});
it('uses a fixed homepage error', async () => {
    reply({
        missingNames: [marker],
        homepages: [],
    });
    await expect(
        selected(() => downloadHomepages('project', [], directory)),
    ).rejects.toThrow('Some homepages were not found or are unpublished.');
});
it('uses a fixed skipped-space warning', async () => {
    reply({
        spaces: [],
        skipped: [{ slug: marker, reason: marker }],
    });
    await selected(() =>
        testHelpers.downloadSpaces('project', 'Project', directory),
    );
    expect(JSON.stringify(vi.mocked(GlobalState.log).mock.calls)).toContain(
        'A space was skipped.',
    );
    expect(JSON.stringify(vi.mocked(GlobalState.log).mock.calls)).not.toContain(
        marker,
    );
});
it('uses a fixed linked virtual-view warning', async () => {
    reply({
        virtualViews: [],
        skipped: [{ slug: marker, reason: marker }],
    });
    await selected(() =>
        testHelpers.downloadLinkedVirtualViews(
            'project',
            ['orders'],
            directory,
        ),
    );
    expect(JSON.stringify(vi.mocked(GlobalState.log).mock.calls)).toContain(
        'A virtual view was skipped.',
    );
    expect(JSON.stringify(vi.mocked(GlobalState.log).mock.calls)).not.toContain(
        marker,
    );
});
it('uses fixed text when an app has no context', async () => {
    await expect(
        selected(async () =>
            ensureDownloadedAppContext('requested', {
                manifest: { slug: marker },
            } as DataAppCodeDownload),
        ),
    ).rejects.toThrow(
        'This server does not support app context downloads. Upgrade the server, or use a CLI version matching your server.',
    );
});
it('omits a rejected server path', async () => {
    await expect(
        selected(() =>
            writeFilesToDir(directory, [
                { path: `../${marker}`, contentBase64: '' },
            ]),
        ),
    ).rejects.toThrow('Refusing to write a file outside the target directory.');
});
it.each([marker, 1, null])(
    'rejects a mistyped timestamp setting %s before debug output',
    async (value) => {
        reply({
            warehouseConnection: {
                type: 'snowflake',
                disableTimestampConversion: value,
            },
        });
        await expect(
            selected(() =>
                getProjectDeploySettings(undefined, 'project', undefined),
            ),
        ).rejects.toThrow(invalid);
        expect(
            JSON.stringify(vi.mocked(GlobalState.debug).mock.calls),
        ).not.toContain(marker);
    },
);
it.each([true, false, undefined])(
    'accepts timestamp setting %s',
    async (value) => {
        reply({
            warehouseConnection: {
                type: 'snowflake',
                disableTimestampConversion: value,
            },
        });
        expect(
            (
                await selected(() =>
                    getProjectDeploySettings(undefined, 'project', undefined),
                )
            ).disableTimestampConversion,
        ).toBe(value);
    },
);
it('accepts a metric result with no duration, as the server sends when it has none', async () => {
    const chart = path.join(directory, 'chart.yml');
    await fs.writeFile(
        chart,
        'name: Orders\ntableName: orders\nmetricQuery:\n  limit: 10\n',
    );
    replyOnce({ queryUuid: '55555555-5555-4555-8555-555555555555' });
    replyOnce({
        status: 'ready',
        metadata: { performance: { initialQueryExecutionMs: null } },
        rows: [],
        columns: {},
    });
    await expect(
        selected(() => runChartHandler({ path: chart })),
    ).resolves.toBeUndefined();
});
it.each([marker, Infinity, NaN, undefined])(
    'rejects an invalid metric duration %s',
    async (duration) => {
        const chart = path.join(directory, 'chart.yml');
        await fs.writeFile(
            chart,
            'name: Orders\ntableName: orders\nmetricQuery:\n  limit: 10\n',
        );
        replyOnce({ queryUuid: '55555555-5555-4555-8555-555555555555' });
        replyOnce({
            status: 'ready',
            metadata: { performance: { initialQueryExecutionMs: duration } },
            rows: [],
            columns: {},
        });
        await expect(
            selected(() => runChartHandler({ path: chart })),
        ).rejects.toThrow(invalid);
    },
);
it.each([
    { stage: 'start', value: marker },
    { stage: 'batch', value: marker },
    { stage: 'batch', value: -1 },
    { stage: 'batch', value: 1.5 },
    { stage: 'finalize', value: marker },
    { stage: 'finalize', value: Infinity },
])(
    'rejects invalid deploy $stage values ($value)',
    async ({ stage, value }) => {
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/deploy'))
                return {
                    deploySessionUuid:
                        stage === 'start'
                            ? value
                            : '55555555-5555-4555-8555-555555555555',
                } as never;
            if (url.endsWith('/batch'))
                return {
                    batchNumber: 0,
                    exploreCount: stage === 'batch' ? value : 1,
                } as never;
            if (url.endsWith('/finalize'))
                return {
                    exploreCount: stage === 'finalize' ? value : 1,
                } as never;
            return {} as never;
        });
        await expect(
            selected(() =>
                deploy(
                    [
                        {
                            name: 'orders',
                            label: 'Orders',
                            tags: [],
                            tables: {},
                            baseTable: 'orders',
                            joinedTables: [],
                            targetDatabase: SupportedDbtAdapter.POSTGRES,
                        },
                    ],
                    {
                        projectDir: directory,
                        profilesDir: '',
                        projectUuid: 'project',
                        batchedDeploy: true,
                    } as Parameters<typeof deploy>[1],
                ),
            ),
        ).rejects.toThrow(invalid);
        expect(
            JSON.stringify(vi.mocked(GlobalState.log).mock.calls),
        ).not.toContain(marker);
    },
);

it('documents unchanged control characters in successful catalogue output', async () => {
    const name = 'db\n\u001b[31mserver-data\u001b[0m';
    reply({
        [name]: { public: { orders: {} } },
    });
    let stdout = '';
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk) => {
            stdout += String(chunk);
            return true;
        });
    await selected(() =>
        warehouseCatalogHandler({
            includeFields: false,
            refresh: false,
            json: true,
            verbose: false,
        }),
    );
    write.mockRestore();
    expect(JSON.parse(stdout).tables[0].database).toBe(name);
});
it('documents unchanged control characters in successful query CSV data', () => {
    const value = 'cell\u001b[31mdata';
    expect(
        resultsToCsv(['field'], [
            { field: { value: { raw: value, formatted: value } } },
        ] as Parameters<typeof resultsToCsv>[1]),
    ).toContain(value);
});
