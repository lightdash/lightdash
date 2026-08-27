import { buildDataAppRead, type DataAppReadSource } from './dataAppRead';

const location = { path: 'src/App.tsx', line: 1, column: 1 };

const source: DataAppReadSource = {
    app: {
        uuid: 'app-uuid',
        slug: 'revenue-app',
        name: 'Revenue app',
        description: 'Revenue by region',
        template: 'dashboard',
        space: { uuid: 'space-uuid', name: 'Finance' },
        views: 12,
        createdByUserUuid: 'user-uuid',
        upstreamAppUuid: 'upstream-uuid',
    },
    latestVersion: {
        version: 3,
        status: 'building',
        statusMessage: 'Compiling',
        error: null,
    },
    latestReadyVersion: {
        version: 2,
        resources: {
            images: [],
            files: [
                {
                    fileId: 'f1',
                    filename: 'notes.md',
                    mimeType: 'text/markdown',
                },
            ],
            charts: [
                {
                    chartUuid: 'chart-1',
                    chartName: 'Revenue by month',
                    chartKind: 'line',
                    linkLive: true,
                },
                {
                    chartUuid: 'chart-2',
                    chartName: 'Orders',
                    chartKind: null,
                },
            ],
            externalConnections: [
                {
                    externalConnectionUuid: 'ec-1',
                    name: 'Weather API',
                    alias: 'weather',
                },
            ],
            dashboardName: 'Finance overview',
            dashboardUuid: 'dash-1',
            clarifications: [{ question: 'Currency?', answer: 'USD' }],
            design: { designUuid: 'd-1', name: 'Brand', fileCount: 2 },
        },
    },
    dataReferences: {
        references: [
            {
                kind: 'query',
                explore: 'orders',
                dimensions: ['orders_region'],
                metrics: ['orders_total_revenue'],
                dimensionFilterFields: ['orders_status'],
                metricFilterFields: [],
                sortFields: ['orders_total_revenue'],
                parameterKeys: ['currency'],
                localFields: [],
                unresolved: [],
                location,
            },
            {
                kind: 'query',
                explore: null,
                dimensions: [],
                metrics: [],
                dimensionFilterFields: [],
                metricFilterFields: [],
                sortFields: [],
                parameterKeys: [],
                localFields: [],
                unresolved: ['explore', 'dimensions'],
                location,
            },
            {
                kind: 'savedChart',
                chartUuid: 'chart-1',
                filterFields: [],
                unresolved: [],
                location,
            },
            {
                kind: 'savedChart',
                chartUuid: 'chart-1',
                filterFields: [],
                unresolved: [],
                location,
            },
            {
                kind: 'savedChart',
                chartUuid: null,
                filterFields: [],
                unresolved: ['chartUuid'],
                location,
            },
            {
                kind: 'externalFetch',
                alias: 'weather',
                path: '/forecast',
                unresolved: [],
                location,
            },
        ],
        parseErrors: [],
        stats: {
            callSites: 6,
            fullyResolved: 4,
            partiallyResolved: 0,
            unresolved: 2,
        },
    },
    externalConnections: [
        { alias: 'weather', origin: 'https://api.weather.example' },
        { alias: 'crm', origin: 'https://crm.example' },
    ],
};

const usage = {
    dashboards: [{ uuid: 'dash-1', name: 'Finance overview', href: '/d' }],
    schedulers: [{ uuid: 'sched-1', name: 'Weekly revenue' }],
};

describe('buildDataAppRead', () => {
    it('maps app rows, versions, data references and usage into a read', () => {
        const read = buildDataAppRead({
            source,
            href: '/projects/p/apps/app-uuid/view',
            usage,
        });

        expect(read.identity).toEqual({
            uuid: 'app-uuid',
            slug: 'revenue-app',
            name: 'Revenue app',
            description: 'Revenue by region',
            template: 'dashboard',
            space: { uuid: 'space-uuid', name: 'Finance' },
            href: '/projects/p/apps/app-uuid/view',
            views: 12,
            createdByUserUuid: 'user-uuid',
        });
        expect(read.status).toEqual({
            latestVersion: {
                version: 3,
                status: 'building',
                statusMessage: 'Compiling',
                error: null,
            },
            latestReadyVersion: 2,
        });
        expect(read.inputs).toEqual({
            charts: [
                {
                    uuid: 'chart-1',
                    name: 'Revenue by month',
                    chartKind: 'line',
                    linkLive: true,
                },
                {
                    uuid: 'chart-2',
                    name: 'Orders',
                    chartKind: null,
                    linkLive: false,
                },
            ],
            dashboard: { uuid: 'dash-1', name: 'Finance overview' },
            clarifications: [{ question: 'Currency?', answer: 'USD' }],
            designName: 'Brand',
            externalConnections: [{ name: 'Weather API', alias: 'weather' }],
        });
        expect(read.usage).toEqual({
            ...usage,
            upstreamAppUuid: 'upstream-uuid',
        });
    });

    it('reports every linked host when an external fetch alias is unresolved', () => {
        const read = buildDataAppRead({
            source: {
                ...source,
                dataReferences: {
                    references: [
                        {
                            kind: 'externalFetch',
                            alias: null,
                            path: null,
                            unresolved: ['alias'],
                            location,
                        },
                    ],
                    parseErrors: [],
                    stats: {
                        callSites: 1,
                        fullyResolved: 0,
                        partiallyResolved: 0,
                        unresolved: 1,
                    },
                },
            },
            href: '/x',
            usage,
        });

        expect(read.data?.externalHosts).toEqual([
            'https://api.weather.example',
            'https://crm.example',
        ]);
    });

    it('keeps one query per call site with unresolved parts, dedupes chart uuids and maps hosts from fetched aliases', () => {
        const read = buildDataAppRead({ source, href: '/x', usage });

        expect(read.data).toEqual({
            queries: [
                {
                    explore: 'orders',
                    dimensions: ['orders_region'],
                    metrics: ['orders_total_revenue'],
                    dimensionFilterFields: ['orders_status'],
                    metricFilterFields: [],
                    parameterKeys: ['currency'],
                    unresolved: [],
                },
                {
                    explore: null,
                    dimensions: [],
                    metrics: [],
                    dimensionFilterFields: [],
                    metricFilterFields: [],
                    parameterKeys: [],
                    unresolved: ['explore', 'dimensions'],
                },
            ],
            savedChartUuids: ['chart-1'],
            externalHosts: ['https://api.weather.example'],
            stats: source.dataReferences?.stats,
        });
    });

    it('reads an app with no ready version as identity and status only', () => {
        const read = buildDataAppRead({
            source: {
                ...source,
                latestVersion: {
                    version: 1,
                    status: 'error',
                    statusMessage: null,
                    error: 'Build failed',
                },
                latestReadyVersion: null,
                dataReferences: null,
            },
            href: '/x',
            usage: { dashboards: [], schedulers: [] },
        });

        expect(read.status.latestReadyVersion).toBeNull();
        expect(read.status.latestVersion?.error).toBe('Build failed');
        expect(read.inputs).toBeNull();
        expect(read.data).toBeNull();
    });

    it('never carries source-shaped fields', () => {
        const read = buildDataAppRead({ source, href: '/x', usage });
        const json = JSON.stringify(read);

        expect(json).not.toContain('"files"');
        expect(json).not.toContain('"dependencies"');
        expect(json).not.toContain('notes.md');
        expect(json).not.toContain('"location"');
    });
});
