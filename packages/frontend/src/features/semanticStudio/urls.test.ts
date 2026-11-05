import { describe, expect, it } from 'vitest';
import { type NodeRef } from './model';
import {
    getLiveDataSourcesRedirectUrl,
    getSemanticStudioSourceUrl,
    getSemanticStudioUrl,
    parseSemanticStudioPath,
} from './urls';

const roundTrip = (ref: NodeRef | null) =>
    parseSemanticStudioPath(getSemanticStudioUrl('p', { ref })).ref;

describe('Semantic Layer URLs', () => {
    it.each<NodeRef | null>([
        null,
        { type: 'kind', kind: 'modelled' },
        { type: 'kind', kind: 'live' },
        { type: 'source', sourceId: 'd85fea83-b5e7-4b83-8c88-71350b5a4ae4' },
        { type: 'source', sourceId: 'live:posthog_events' },
        { type: 'group', sourceId: 'warehouse', path: ['finance'] },
        { type: 'group', sourceId: 'warehouse', path: ['a b', 'c&d', 'é'] },
        { type: 'group', sourceId: 'warehouse', path: ['Sales/Ops', 'EMEA'] },
        { type: 'explore', exploreId: 'orders' },
        { type: 'explore', exploreId: 'weird name?#%' },
        {
            type: 'field',
            exploreId: 'posthog_events',
            fieldId: 'posthog_events_property_account_id',
        },
    ])('round-trips %j', (ref) => {
        expect(roundTrip(ref)).toEqual(ref);
    });

    it('builds readable paths', () => {
        expect(
            getSemanticStudioUrl('p', {
                ref: {
                    type: 'group',
                    sourceId: 'warehouse',
                    path: ['finance', 'billing'],
                },
            }),
        ).toBe(
            '/projects/p/semantic-layer/sources/warehouse/groups/finance/billing',
        );
        expect(getSemanticStudioSourceUrl('p', 'abc')).toBe(
            '/projects/p/semantic-layer/sources/abc',
        );
    });

    it('still reads the old /folders/ links', () => {
        expect(
            parseSemanticStudioPath(
                '/projects/p/semantic-layer/sources/warehouse/folders/finance',
            ).ref,
        ).toEqual({ type: 'group', sourceId: 'warehouse', path: ['finance'] });
    });

    it.each([
        '/projects/p/semantic-layer/kinds/unknown',
        '/projects/p/semantic-layer/explores',
        '/projects/p/semantic-layer/explores/orders/columns/x',
        '/projects/p/semantic-layer/nonsense/a/b',
        '/projects/p/semantic-layer-other/explores/orders',
        '/projects/p/semantic-layer/explores/%E0%A4%A',
    ])('opens the root for %s', (pathname) => {
        const { ref } = parseSemanticStudioPath(pathname);
        // Malformed escapes are kept as typed rather than throwing.
        if (ref?.type === 'explore') {
            expect(ref.exploreId).toBe('%E0%A4%A');
        } else {
            expect(ref).toBeNull();
        }
    });

    describe('old Settings › Live data sources links', () => {
        it.each([
            ['', '', '/projects/p/semantic-layer/kinds/live'],
            ['/', '', '/projects/p/semantic-layer/kinds/live'],
            [
                '',
                '?connected=c-1',
                '/projects/p/semantic-layer/kinds/live?connected=c-1',
            ],
            [
                '',
                '?pickGoogleSource=true',
                '/projects/p/semantic-layer/kinds/live?pickGoogleSource=true',
            ],
            [
                '',
                '?signInError=denied',
                '/projects/p/semantic-layer/kinds/live?signInError=denied',
            ],
            ['', '?add=true', '/projects/p/semantic-layer/kinds/live?add=true'],
            ['c-1', '', '/projects/p/semantic-layer/sources/c-1'],
            ['c-1/fields', '', '/projects/p/semantic-layer/sources/c-1'],
        ])('%s%s opens %s', (rest, search, expected) => {
            expect(getLiveDataSourcesRedirectUrl('p', rest, search)).toBe(
                expected,
            );
        });
    });
});
