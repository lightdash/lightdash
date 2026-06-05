import { ChartKind, ContentType } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../api';
import {
    buildContentMentionSuggestionItems,
    contextItemsToContentMentionSuggestions,
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

describe('contentMentions', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset();
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

    it('merges mention suggestions deduping charts by uuid, first wins', () => {
        const threadChart: ContentMentionSuggestionItem = {
            id: 'thread:chart:chart-1',
            label: 'Revenue',
            contentType: ContentType.CHART,
            uuid: 'chart-1',
            slug: 'revenue-chart',
            group: 'thread',
        };
        const tileChart: ContentMentionSuggestionItem = {
            id: 'dashboardTile:chart:chart-1',
            label: 'Revenue by month (tile title)',
            contentType: ContentType.CHART,
            uuid: 'chart-1',
            slug: 'revenue-chart',
            group: 'dashboardTile',
        };
        const tileChart2: ContentMentionSuggestionItem = {
            id: 'dashboardTile:chart:chart-2',
            label: 'Active users',
            contentType: ContentType.CHART,
            uuid: 'chart-2',
            slug: 'active-users',
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
                        group: 'current',
                    },
                    {
                        id: 'dashboardTile:chart:chart-1',
                        label: 'Revenue by month',
                        contentType: ContentType.CHART,
                        uuid: 'chart-1',
                        slug: 'revenue-by-month',
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
});
