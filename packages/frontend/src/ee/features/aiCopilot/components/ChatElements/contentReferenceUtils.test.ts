import { ChartKind } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildContentReferenceSegments } from './contentReferenceUtils';

describe('contentReferenceUtils', () => {
    it('turns mentioned content labels into ordered reference segments', () => {
        const result = buildContentReferenceSegments(
            'Table Calculations Tests Dashboard & [Fanout] Inflated vs Safe [Fanout] One-to-One Addresses use these as inspo',
            [
                {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                    dashboardSlug: 'table-calculations-tests-dashboard',
                    displayName: 'Table Calculations Tests Dashboard',
                    pinnedVersionUuid: null,
                },
                {
                    type: 'chart',
                    chartUuid: 'chart-1',
                    chartSlug: 'fanout-inflated-vs-safe',
                    displayName: '[Fanout] Inflated vs Safe',
                    pinnedVersionUuid: null,
                    runtimeOverrides: null,
                    chartKind: ChartKind.VERTICAL_BAR,
                },
                {
                    type: 'chart',
                    chartUuid: 'chart-2',
                    chartSlug: 'fanout-one-to-one-addresses',
                    displayName: '[Fanout] One-to-One Addresses',
                    pinnedVersionUuid: null,
                    runtimeOverrides: null,
                    chartKind: ChartKind.VERTICAL_BAR,
                },
            ],
        );

        expect(result.segments).toEqual([
            expect.objectContaining({
                type: 'reference',
                key: 'dashboard:dashboard-1',
                label: 'Table Calculations Tests Dashboard',
            }),
            { type: 'text', text: ' & ' },
            expect.objectContaining({
                type: 'reference',
                key: 'chart:chart-1',
                label: '[Fanout] Inflated vs Safe',
            }),
            { type: 'text', text: ' ' },
            expect.objectContaining({
                type: 'reference',
                key: 'chart:chart-2',
                label: '[Fanout] One-to-One Addresses',
            }),
            { type: 'text', text: ' use these as inspo' },
        ]);
        expect([...result.matchedKeys]).toEqual([
            'dashboard:dashboard-1',
            'chart:chart-1',
            'chart:chart-2',
        ]);
    });

    it('renders a reference chip for every occurrence of a repeated tag', () => {
        const result = buildContentReferenceSegments(
            'test charliedowler/Slugger charliedowler/Slugger charliedowler/Slugger',
            [{ type: 'repository', fullName: 'charliedowler/Slugger' }],
        );

        const references = result.segments.filter(
            (segment) => segment.type === 'reference',
        );
        expect(references).toHaveLength(3);
        expect(
            references.every(
                (segment) =>
                    segment.type === 'reference' &&
                    segment.label === 'charliedowler/Slugger',
            ),
        ).toBe(true);
        // The key is still recorded once for pinned-card accounting.
        expect([...result.matchedKeys]).toEqual([
            'repository:charliedowler/Slugger',
        ]);
    });

    it('matches a same-named file and repository to separate occurrences', () => {
        const result = buildContentReferenceSegments(
            'compare file hello/world with repo hello/world',
            [
                { type: 'file', path: 'hello/world' },
                { type: 'repository', fullName: 'hello/world' },
            ],
        );

        const references = result.segments.filter(
            (segment) => segment.type === 'reference',
        );
        // Two occurrences, two distinct references — the first goes to the file,
        // the second to the repository (not the file twice).
        expect(references.map((s) => s.type === 'reference' && s.key)).toEqual([
            'file:hello/world',
            'repository:hello/world',
        ]);
        expect([...result.matchedKeys]).toEqual([
            'file:hello/world',
            'repository:hello/world',
        ]);
    });
});
