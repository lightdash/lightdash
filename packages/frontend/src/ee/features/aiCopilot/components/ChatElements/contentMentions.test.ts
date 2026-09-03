import {
    ChartKind,
    ContentType,
    type ApiContentResponse,
    type DataAppContent,
} from '@lightdash/common';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../api';
import {
    buildContentMentionSuggestionItems,
    contentMentionMenuOwnsEnter,
    contextItemsToContentMentionSuggestions,
    createContentMentionExtension,
    extractContentMentionContext,
    fuzzyContentMentionLabelMatch,
    getContentMentionEmptyMessage,
    mergeAiPromptContextInput,
    mergeContentMentionSuggestionItems,
    type ContentMentionSuggestionItem,
} from './contentMentions';

vi.mock('../../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

const mockedLightdashApi = vi.mocked(lightdashApi);

const dataAppResult = (
    overrides: Partial<DataAppContent> & Pick<DataAppContent, 'uuid'>,
): DataAppContent =>
    ({
        contentType: ContentType.DATA_APP,
        name: `App ${overrides.uuid}`,
        slug: overrides.uuid,
        space: { uuid: 'space-1', name: 'Shared' },
        template: 'dashboard',
        ...overrides,
    }) as DataAppContent;

const mockContentSearch = (data: DataAppContent[]) => {
    mockedLightdashApi.mockResolvedValue({
        data,
    } as unknown as ApiContentResponse['results']);
};

// Undestroyed editors leave DOMObserver timers behind that fire after jsdom
// teardown.
const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
});

const buildMentionEditor = (mentions: Record<string, unknown>[]) => {
    const editor = new Editor({
        extensions: [
            Document,
            Paragraph,
            Text,
            createContentMentionExtension({
                getProjectUuid: () => 'project-uuid',
                getPriorityItems: () => [],
            }),
        ],
        content: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: mentions.map((attrs) => ({
                        type: 'contentMention',
                        attrs,
                    })),
                },
            ],
        },
    });
    editors.push(editor);
    return editor;
};

describe('contentMentions', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset();
    });

    describe('data app mentions', () => {
        it('requests data apps, including personal ones, without chart types', async () => {
            mockContentSearch([]);

            await buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'f1',
                priorityItems: [],
            });

            const url = new URL(
                mockedLightdashApi.mock.calls[0][0].url,
                'http://localhost',
            );
            expect(url.searchParams.getAll('contentTypes')).toEqual([
                ContentType.CHART,
                ContentType.DASHBOARD,
                ContentType.DATA_APP,
            ]);
            expect(url.searchParams.get('includePersonalDataApps')).toBe(
                'true',
            );
            expect(url.searchParams.get('dataAppVizsFilter')).toBe('exclude');
        });

        it('drops project chart type results and labels personal apps', async () => {
            mockContentSearch([
                dataAppResult({ uuid: 'app-1', name: 'F1 standings' }),
                dataAppResult({ uuid: 'viz-1', template: 'data_app_viz' }),
                dataAppResult({
                    uuid: 'app-personal',
                    name: 'My scratch app',
                    space: null,
                }),
            ]);

            const items = await buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'app',
                priorityItems: [],
            });

            expect(items.map((item) => item.uuid)).toEqual([
                'app-1',
                'app-personal',
            ]);
            expect(items[0]).toMatchObject({
                contentType: ContentType.DATA_APP,
                label: 'F1 standings',
                slug: 'app-1',
                spaceName: 'Shared',
                isPersonalDataApp: false,
                group: 'search',
            });
            expect(items[1]).toMatchObject({
                spaceName: null,
                isPersonalDataApp: true,
            });
        });

        it('hides personal apps when the agent is space-restricted', async () => {
            mockContentSearch([
                dataAppResult({ uuid: 'app-1' }),
                dataAppResult({ uuid: 'app-personal', space: null }),
            ]);

            const items = await buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'app',
                priorityItems: [],
                hidePersonalDataApps: true,
            });

            expect(items.map((item) => item.uuid)).toEqual(['app-1']);
        });

        it('hides personal apps offered by priority groups when the agent is space-restricted', async () => {
            mockContentSearch([dataAppResult({ uuid: 'app-1' })]);

            const items = await buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'app',
                priorityItems: [
                    {
                        id: 'current:data_app:app-personal',
                        label: 'App scratch',
                        contentType: ContentType.DATA_APP,
                        uuid: 'app-personal',
                        slug: 'scratch',
                        isPersonalDataApp: true,
                        group: 'current',
                    },
                ],
                hidePersonalDataApps: true,
            });

            expect(items.map((item) => item.uuid)).toEqual(['app-1']);
        });

        it('dedupes an already mentioned app against search results by uuid', async () => {
            mockContentSearch([
                dataAppResult({ uuid: 'app-1', name: 'F1 standings' }),
            ]);

            const items = await buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'f1',
                priorityItems: [
                    {
                        id: 'thread:data_app:app-1',
                        label: 'F1 standings',
                        contentType: ContentType.DATA_APP,
                        uuid: 'app-1',
                        slug: 'f1-standings',
                        isPersonalDataApp: false,
                        group: 'thread',
                    },
                ],
            });

            expect(items).toHaveLength(1);
            expect(items[0].group).toBe('thread');
        });

        it('maps pinned data apps into "Already mentioned" suggestions', () => {
            expect(
                contextItemsToContentMentionSuggestions(
                    [
                        {
                            type: 'data_app',
                            appUuid: 'app-1',
                            appSlug: 'f1-standings',
                            displayName: 'F1 standings',
                            pinnedVersion: 3,
                            isPersonal: false,
                        },
                    ],
                    'thread',
                ),
            ).toEqual([
                {
                    id: 'thread:data_app:app-1',
                    label: 'F1 standings',
                    contentType: ContentType.DATA_APP,
                    uuid: 'app-1',
                    slug: 'f1-standings',
                    isPersonalDataApp: false,
                    group: 'thread',
                },
            ]);
        });

        it('extracts a data app mention as a data_app context item, deduped by uuid', () => {
            const editor = buildMentionEditor([
                {
                    contentType: ContentType.DATA_APP,
                    uuid: 'app-1',
                    slug: 'f1-standings',
                    label: 'F1 standings',
                },
                {
                    contentType: ContentType.DATA_APP,
                    uuid: 'app-1',
                    slug: 'f1-standings',
                    label: 'F1 standings',
                },
            ]);

            expect(extractContentMentionContext(editor)).toEqual({
                context: [
                    {
                        type: 'data_app',
                        appUuid: 'app-1',
                        appSlug: 'f1-standings',
                    },
                ],
                optimisticContext: [
                    {
                        type: 'data_app',
                        appUuid: 'app-1',
                        appSlug: 'f1-standings',
                        displayName: 'F1 standings',
                        pinnedVersion: null,
                        isPersonal: false,
                    },
                ],
            });
        });
    });

    it('dedupes prompt context preserving first occurrence', () => {
        expect(
            mergeAiPromptContextInput(
                [
                    {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-1',
                        dashboardSlug: 'exec-dashboard',
                    },
                    {
                        type: 'chart',
                        chartUuid: 'chart-1',
                        chartSlug: 'revenue-chart',
                    },
                ],
                [
                    {
                        type: 'chart',
                        chartUuid: 'chart-1',
                        chartSlug: 'duplicate-chart',
                    },
                ],
            ),
        ).toEqual([
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                dashboardSlug: 'exec-dashboard',
            },
            {
                type: 'chart',
                chartUuid: 'chart-1',
                chartSlug: 'revenue-chart',
            },
        ]);
    });

    it('dedupes duplicate dashboard input without merging refs', () => {
        expect(
            mergeAiPromptContextInput(
                [
                    {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-1',
                        dashboardSlug: 'exec-dashboard',
                    },
                ],
                [
                    {
                        type: 'dashboard',
                        dashboardUuid: 'dashboard-1',
                        dashboardSlug: 'duplicate-dashboard',
                    },
                ],
            ),
        ).toEqual([
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                dashboardSlug: 'exec-dashboard',
            },
        ]);
    });

    it('dedupes file and repository context by their natural key, first wins', () => {
        expect(
            mergeAiPromptContextInput(
                [
                    { type: 'file', path: 'models/orders.sql' },
                    { type: 'repository', fullName: 'acme/dbt' },
                ],
                [
                    { type: 'file', path: 'models/orders.sql' },
                    { type: 'repository', fullName: 'acme/other' },
                ],
            ),
        ).toEqual([
            { type: 'file', path: 'models/orders.sql' },
            { type: 'repository', fullName: 'acme/dbt' },
            { type: 'repository', fullName: 'acme/other' },
        ]);
    });

    it('keeps a file and a repository with the same name as distinct items', () => {
        expect(
            mergeAiPromptContextInput([
                { type: 'file', path: 'hello/world' },
                { type: 'repository', fullName: 'hello/world' },
            ]),
        ).toEqual([
            { type: 'file', path: 'hello/world' },
            { type: 'repository', fullName: 'hello/world' },
        ]);
    });

    it('dedupes attached external sources by source uuid', () => {
        expect(
            mergeAiPromptContextInput(
                [
                    {
                        type: 'external_source',
                        sourceUuid: 'source-1',
                    },
                ],
                [
                    {
                        type: 'external_source',
                        sourceUuid: 'source-1',
                    },
                ],
            ),
        ).toEqual([
            {
                type: 'external_source',
                sourceUuid: 'source-1',
            },
        ]);
    });

    it('merges mention suggestions deduping charts by uuid, first wins', () => {
        const threadChart: ContentMentionSuggestionItem = {
            id: 'thread:chart:chart-1',
            label: 'Revenue',
            contentType: ContentType.CHART,
            uuid: 'chart-1',
            slug: 'revenue-chart',
            isPersonalDataApp: false,
            group: 'thread',
        };
        const tileChart: ContentMentionSuggestionItem = {
            id: 'dashboardTile:chart:chart-1',
            label: 'Revenue by month (tile title)',
            contentType: ContentType.CHART,
            uuid: 'chart-1',
            slug: 'revenue-chart',
            isPersonalDataApp: false,
            group: 'dashboardTile',
        };
        const tileChart2: ContentMentionSuggestionItem = {
            id: 'dashboardTile:chart:chart-2',
            label: 'Active users',
            contentType: ContentType.CHART,
            uuid: 'chart-2',
            slug: 'active-users',
            isPersonalDataApp: false,
            group: 'dashboardTile',
        };

        expect(
            mergeContentMentionSuggestionItems(
                [threadChart],
                [tileChart, tileChart2],
            ),
        ).toEqual([threadChart, tileChart2]);
    });

    it('maps existing context into mention suggestions', () => {
        expect(
            contextItemsToContentMentionSuggestions(
                [
                    {
                        type: 'chart',
                        chartUuid: 'chart-1',
                        chartSlug: 'revenue-chart',
                        displayName: 'Revenue',
                        pinnedVersionUuid: null,
                        runtimeOverrides: null,
                        chartKind: ChartKind.VERTICAL_BAR,
                    },
                ],
                'thread',
            ),
        ).toEqual([
            {
                id: 'thread:chart:chart-1',
                label: 'Revenue',
                contentType: ContentType.CHART,
                uuid: 'chart-1',
                slug: 'revenue-chart',
                chartKind: ChartKind.VERTICAL_BAR,
                isPersonalDataApp: false,
                group: 'thread',
            },
        ]);
    });

    it('filters priority suggestions by query when no project search is available', async () => {
        await expect(
            buildContentMentionSuggestionItems({
                projectUuid: undefined,
                query: 'rev',
                priorityItems: [
                    {
                        id: 'current:dashboard:dashboard-1',
                        label: 'Executive dashboard',
                        contentType: ContentType.DASHBOARD,
                        uuid: 'dashboard-1',
                        slug: 'exec-dashboard',
                        isPersonalDataApp: false,
                        group: 'current',
                    },
                    {
                        id: 'dashboardTile:chart:chart-1',
                        label: 'Revenue by month',
                        contentType: ContentType.CHART,
                        uuid: 'chart-1',
                        slug: 'revenue-by-month',
                        isPersonalDataApp: false,
                        group: 'dashboardTile',
                    },
                ],
            }),
        ).resolves.toEqual([
            {
                id: 'dashboardTile:chart:chart-1',
                label: 'Revenue by month',
                contentType: ContentType.CHART,
                uuid: 'chart-1',
                slug: 'revenue-by-month',
                isPersonalDataApp: false,
                group: 'dashboardTile',
            },
        ]);
    });

    it('matches priority suggestions ignoring punctuation', () => {
        expect(fuzzyContentMentionLabelMatch("What's revenue", 'Whats')).toBe(
            true,
        );
        expect(
            fuzzyContentMentionLabelMatch('Revenue by month', 'rev mon'),
        ).toBe(true);
    });

    it('does not search content API until the query has at least two characters', async () => {
        await expect(
            buildContentMentionSuggestionItems({
                projectUuid: 'project-uuid',
                query: 'r',
                priorityItems: [],
            }),
        ).resolves.toEqual([]);

        expect(mockedLightdashApi).not.toHaveBeenCalled();
    });

    it('prompts for more characters before content API search starts', () => {
        expect(getContentMentionEmptyMessage('')).toBe(
            'Type 2 more characters to search content',
        );
        expect(getContentMentionEmptyMessage('r')).toBe(
            'Type 1 more character to search content',
        );
        expect(getContentMentionEmptyMessage('re')).toBe('No content found');
    });

    describe('Enter ownership', () => {
        it('lets the dropdown select while it has items', () => {
            expect(
                contentMentionMenuOwnsEnter(
                    { status: 'open', itemCount: 3 },
                    true,
                ),
            ).toBe(true);
        });

        it('hands Enter back when the dropdown has no items', () => {
            expect(
                contentMentionMenuOwnsEnter(
                    { status: 'open', itemCount: 0 },
                    true,
                ),
            ).toBe(false);
        });

        it('hands Enter back once the dropdown is dismissed', () => {
            expect(
                contentMentionMenuOwnsEnter({ status: 'dismissed' }, true),
            ).toBe(false);
        });

        it('holds Enter while items are still resolving', () => {
            expect(
                contentMentionMenuOwnsEnter({ status: 'closed' }, true),
            ).toBe(true);
            expect(
                contentMentionMenuOwnsEnter({ status: 'closed' }, false),
            ).toBe(false);
        });
    });
});
