import { ChartKind, ContentType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildContentMentionSuggestionItems,
    contextItemsToContentMentionSuggestions,
    mergeAiPromptContextInput,
} from './contentMentions';

describe('contentMentions', () => {
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
});
