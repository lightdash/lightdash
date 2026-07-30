import { describe, expect, test } from 'vitest';
import { getChartSlugRenamePlan } from './SavedChartModel';

const chart = ({
    uuid,
    name,
    slug,
    deleted = false,
}: {
    uuid: string;
    name: string;
    slug: string;
    deleted?: boolean;
}) => ({
    saved_query_uuid: uuid,
    name,
    slug,
    deleted_at: deleted ? new Date('2026-01-01') : null,
});

describe('getChartSlugRenamePlan', () => {
    test('renames an arbitrary active chart slug', () => {
        expect(
            getChartSlugRenamePlan(
                [
                    chart({
                        uuid: 'chart-uuid',
                        name: 'My chart',
                        slug: 'my-old-chart-name',
                    }),
                ],
                'my-old-chart-name',
                'my-amazing-chart',
            ),
        ).toEqual([
            {
                contentUuid: 'chart-uuid',
                name: 'My chart',
                oldSlug: 'my-old-chart-name',
                newSlug: 'my-amazing-chart',
            },
        ]);
    });

    test('rejects a slug used by an active or deleted chart', () => {
        const charts = [
            chart({ uuid: 'source', name: 'Source', slug: 'source' }),
            chart({
                uuid: 'deleted',
                name: 'Deleted',
                slug: 'reserved',
                deleted: true,
            }),
        ];

        expect(() =>
            getChartSlugRenamePlan(charts, 'source', 'reserved'),
        ).toThrow('Chart slug "reserved" is already in use');
    });

    test('rejects a missing or deleted source chart', () => {
        expect(() =>
            getChartSlugRenamePlan(
                [
                    chart({
                        uuid: 'deleted',
                        name: 'Deleted',
                        slug: 'old',
                        deleted: true,
                    }),
                ],
                'old',
                'new',
            ),
        ).toThrow('Active chart with slug "old" was not found');
    });

    test.each([
        'Uppercase',
        'two--hyphens',
        '-leading',
        'trailing-',
        'a'.repeat(256),
    ])('rejects invalid target slug %s', (newSlug) => {
        expect(() =>
            getChartSlugRenamePlan(
                [chart({ uuid: 'source', name: 'Source', slug: 'source' })],
                'source',
                newSlug,
            ),
        ).toThrow('Invalid chart slug');
    });

    test('rejects a no-op rename', () => {
        expect(() =>
            getChartSlugRenamePlan(
                [chart({ uuid: 'source', name: 'Source', slug: 'source' })],
                'source',
                'source',
            ),
        ).toThrow('Chart already has the slug "source"');
    });
});
