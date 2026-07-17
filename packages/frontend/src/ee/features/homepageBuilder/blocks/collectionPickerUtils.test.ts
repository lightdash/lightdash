import { ContentType, type SummaryContent } from '@lightdash/common';
import {
    buildSelectionRefs,
    groupContentBySpace,
    toItemRef,
} from './collectionPickerUtils';

const chart = (uuid: string, name: string, spaceName: string): SummaryContent =>
    ({
        contentType: ContentType.CHART,
        uuid,
        name,
        space: { uuid: `${spaceName}-uuid`, name: spaceName },
    }) as SummaryContent;

const dashboard = (
    uuid: string,
    name: string,
    spaceName: string,
): SummaryContent =>
    ({
        contentType: ContentType.DASHBOARD,
        uuid,
        name,
        space: { uuid: `${spaceName}-uuid`, name: spaceName },
    }) as SummaryContent;

describe('toItemRef', () => {
    it('maps a chart to a chart ref', () => {
        expect(toItemRef(chart('c1', 'Chart 1', 'Space A'))).toEqual({
            contentType: 'chart',
            uuid: 'c1',
        });
    });

    it('maps a dashboard to a dashboard ref', () => {
        expect(toItemRef(dashboard('d1', 'Dashboard 1', 'Space A'))).toEqual({
            contentType: 'dashboard',
            uuid: 'd1',
        });
    });
});

describe('groupContentBySpace', () => {
    it('groups content by space name, spaces and items sorted alphabetically', () => {
        const contentMap = new Map([
            ['c2', chart('c2', 'Zebra chart', 'Space B')],
            ['c1', chart('c1', 'Alpha chart', 'Space B')],
            ['d1', dashboard('d1', 'Some dashboard', 'Space A')],
        ]);

        expect(groupContentBySpace(contentMap)).toEqual([
            {
                group: 'Space A',
                items: [{ value: 'd1', label: 'Some dashboard' }],
            },
            {
                group: 'Space B',
                items: [
                    { value: 'c1', label: 'Alpha chart' },
                    { value: 'c2', label: 'Zebra chart' },
                ],
            },
        ]);
    });

    it('returns an empty array for an empty map', () => {
        expect(groupContentBySpace(new Map())).toEqual([]);
    });
});

describe('buildSelectionRefs', () => {
    it('resolves newly-added uuids from the content map', () => {
        const contentMap = new Map([['c1', chart('c1', 'Chart 1', 'Space A')]]);
        const result = buildSelectionRefs(['c1'], new Map(), contentMap);
        expect(result).toEqual(
            new Map([['c1', { contentType: 'chart', uuid: 'c1' }]]),
        );
    });

    it('preserves a previously-selected ref even if missing from the content map', () => {
        const prevSelected = new Map([
            ['stale1', { contentType: 'dashboard' as const, uuid: 'stale1' }],
        ]);
        const result = buildSelectionRefs(['stale1'], prevSelected, new Map());
        expect(result).toEqual(prevSelected);
    });

    it('drops uuids no longer present in newUuids', () => {
        const prevSelected = new Map([
            ['c1', { contentType: 'chart' as const, uuid: 'c1' }],
        ]);
        const result = buildSelectionRefs([], prevSelected, new Map());
        expect(result).toEqual(new Map());
    });

    it('silently skips a newly-added uuid absent from both prevSelected and contentMap', () => {
        const result = buildSelectionRefs(['unknown'], new Map(), new Map());
        expect(result).toEqual(new Map());
    });
});
