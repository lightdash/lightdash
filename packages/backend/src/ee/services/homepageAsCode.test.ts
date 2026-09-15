import {
    ContentAsCodeType,
    parseHomepageAsCode,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import {
    downloadHomepageConfig,
    uploadHomepageConfig,
    type HomepageContentReference,
} from './homepageAsCode';

const sourceProject = 'source-project';
const destinationProject = 'destination-project';
const siteUrl = 'https://lightdash.example.com';
const references: HomepageContentReference[] = [
    { contentType: 'chart', uuid: 'chart-uuid', slug: 'revenue' },
    { contentType: 'dashboard', uuid: 'dashboard-uuid', slug: 'overview' },
    { contentType: 'space', uuid: 'space-uuid', slug: 'shared' },
    { contentType: 'data_app', uuid: 'app-uuid', slug: 'forecast' },
];
const configFor = (blocks: HomepageBlock[]): HomepageConfig => ({
    version: 1,
    rows: blocks.map((block, index) => ({
        id: `row-${index}`,
        blocks: [block],
    })),
});

describe('homepage content-as-code translation', () => {
    it('round trips every block type, preserving layout and live source settings', () => {
        const config = configFor([
            {
                id: '1',
                type: 'greeting',
                config: { subtitle: 'Welcome', density: 'compact' },
            },
            {
                id: '2',
                type: 'ask-ai-hero',
                config: {
                    showGreeting: true,
                    showRecommendedActions: false,
                    density: 'full',
                },
            },
            {
                id: '3',
                type: 'collection',
                config: {
                    title: 'Content',
                    items: references.map(({ contentType, uuid }) => ({
                        contentType,
                        uuid,
                    })),
                    source: 'verified',
                    verifiedOnly: true,
                    limit: 12,
                    layout: 'list',
                    contentTypes: ['chart', 'data_app'],
                },
            },
            {
                id: '4',
                type: 'resources',
                config: {
                    title: 'Resources',
                    layout: 'card',
                    showDescriptions: false,
                    items: [
                        {
                            title: 'Docs',
                            description: 'Help',
                            kind: 'doc',
                            url: 'https://docs.example.com',
                            imageUrl: 'https://docs.example.com/image.png',
                        },
                    ],
                },
            },
            {
                id: '5',
                type: 'quick-actions',
                config: {
                    actions: [
                        {
                            type: 'dashboard',
                            dashboardUuid: 'dashboard-uuid',
                            label: 'Overview',
                            primary: true,
                        },
                        {
                            type: 'space',
                            spaceUuid: 'space-uuid',
                            label: 'Shared',
                        },
                        { type: 'my-space' },
                    ],
                },
            },
            {
                id: '6',
                type: 'cta',
                config: {
                    title: 'Open',
                    description: 'Overview',
                    buttonLabel: 'Go',
                    theme: 'custom',
                    customColor: '#abc123',
                    background: 'theme',
                    align: 'right',
                    target: {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-uuid',
                        label: 'Overview',
                    },
                },
            },
            {
                id: '7',
                type: 'metrics',
                config: {
                    title: 'Metrics',
                    items: [
                        {
                            tableName: 'orders',
                            metricName: 'total',
                            label: 'Orders',
                        },
                    ],
                },
            },
            {
                id: '8',
                type: 'announcements',
                config: { title: 'News', collapseAfterFirst: true },
            },
            { id: '9', type: 'favorites', config: { title: 'Favorites' } },
            { id: '10', type: 'recent', config: { title: 'Recent' } },
            { id: '11', type: 'markdown', config: { content: '# Hello' } },
        ]);
        const portable = downloadHomepageConfig(
            config,
            sourceProject,
            references,
            siteUrl,
        );
        const document = parseHomepageAsCode(
            {
                contentType: ContentAsCodeType.HOMEPAGE,
                version: 1,
                name: 'Home',
                config: portable,
                publication: null,
            },
            'home.yml',
        );
        expect(
            uploadHomepageConfig(
                document.config,
                sourceProject,
                references,
                siteUrl,
            ),
        ).toEqual(config);
        const destination = references.map((reference) => ({
            ...reference,
            uuid: `destination-${reference.uuid}`,
        }));
        const imported = uploadHomepageConfig(
            document.config,
            destinationProject,
            destination,
            siteUrl,
        );
        expect(JSON.stringify(imported)).not.toContain('"uuid":"chart-uuid"');
        expect(imported.rows[2].blocks[0]).toMatchObject({
            config: {
                items: [
                    { contentType: 'chart', uuid: 'destination-chart-uuid' },
                    {
                        contentType: 'dashboard',
                        uuid: 'destination-dashboard-uuid',
                    },
                    { contentType: 'space', uuid: 'destination-space-uuid' },
                    { contentType: 'data_app', uuid: 'destination-app-uuid' },
                ],
            },
        });
    });

    it('translates internal links, preserves external links, and omits signed app thumbnails', () => {
        const internal = `/projects/${sourceProject}/dashboards/dashboard-uuid/view?tab=1#section`;
        const external = `https://external.example.com${internal}`;
        const config = configFor([
            {
                id: 'markdown',
                type: 'markdown',
                config: {
                    content: `[relative](${internal}) [absolute](${siteUrl}${internal}) [external](${external})`,
                },
            },
            {
                id: 'cta',
                type: 'cta',
                config: {
                    buttonLabel: 'Open',
                    target: { type: 'link', url: internal },
                },
            },
            {
                id: 'resources',
                type: 'resources',
                config: {
                    title: 'Apps',
                    items: [
                        {
                            title: 'Forecast',
                            kind: 'data-app',
                            url: `/projects/${sourceProject}/apps/app-uuid`,
                            appUuid: 'app-uuid',
                            imageUrl:
                                'https://storage.example.com/signed-secret',
                        },
                    ],
                },
            },
        ]);
        const portable = downloadHomepageConfig(
            config,
            sourceProject,
            references,
            siteUrl,
        );
        expect(JSON.stringify(portable)).not.toContain('signed-secret');
        expect(portable.rows[0].blocks[0]).toMatchObject({
            config: {
                content: `[relative](lightdash://dashboards/overview/view?tab=1#section) [absolute](lightdash://dashboards/overview/view?tab=1#section) [external](${external})`,
            },
        });
        const destination = references.map((reference) => ({
            ...reference,
            uuid: `destination-${reference.uuid}`,
        }));
        const imported = uploadHomepageConfig(
            portable,
            destinationProject,
            destination,
            siteUrl,
        );
        expect(imported.rows[0].blocks[0]).toMatchObject({
            config: {
                content: `[relative](/projects/${destinationProject}/dashboards/destination-dashboard-uuid/view?tab=1#section) [absolute](/projects/${destinationProject}/dashboards/destination-dashboard-uuid/view?tab=1#section) [external](${external})`,
            },
        });
        expect(imported.rows[2].blocks[0]).toMatchObject({
            config: { items: [{ appUuid: 'destination-app-uuid' }] },
        });
    });

    it('rejects missing and ambiguous references and invalid encoded links', () => {
        const config = configFor([
            {
                id: '1',
                type: 'collection',
                config: {
                    title: 'Content',
                    items: [{ contentType: 'chart', uuid: 'chart-uuid' }],
                },
            },
        ]);
        const portable = downloadHomepageConfig(
            config,
            sourceProject,
            references,
            siteUrl,
        );
        expect(() =>
            uploadHomepageConfig(portable, destinationProject, [], siteUrl),
        ).toThrow('missing');
        expect(() =>
            uploadHomepageConfig(
                portable,
                destinationProject,
                [...references, references[0]],
                siteUrl,
            ),
        ).toThrow('ambiguous');
        expect(() =>
            uploadHomepageConfig(
                {
                    version: 1,
                    rows: [
                        {
                            id: 'row',
                            blocks: [
                                {
                                    id: 'block',
                                    type: 'markdown',
                                    config: {
                                        content:
                                            '[bad](lightdash://dashboards/%zz)',
                                    },
                                },
                            ],
                        },
                    ],
                },
                destinationProject,
                references,
                siteUrl,
            ),
        ).toThrow('Invalid encoded');
    });

    it('rejects incompatible documents and malformed block layouts before storage', () => {
        const document = {
            contentType: 'homepage',
            version: 1,
            name: 'Home',
            config: { version: 1, rows: [] },
            publication: null,
        };
        expect(() =>
            parseHomepageAsCode({ ...document, version: 2 }, 'home.yml'),
        ).toThrow('home.yml');
        expect(() =>
            parseHomepageAsCode(
                {
                    ...document,
                    config: {
                        version: 1,
                        rows: [
                            {
                                id: 'row',
                                blocks: Array(3).fill({
                                    id: 'block',
                                    type: 'markdown',
                                    config: { content: 'Hello' },
                                }),
                            },
                        ],
                    },
                },
                'home.yml',
            ),
        ).toThrow();
        expect(() =>
            parseHomepageAsCode(
                {
                    ...document,
                    publication: {
                        isDefault: true,
                        groups: [],
                        roles: ['unknown-role'],
                    },
                },
                'home.yml',
            ),
        ).toThrow('publication.roles');
    });
});
