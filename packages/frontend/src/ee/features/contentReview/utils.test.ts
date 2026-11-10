import { describe, expect, it } from 'vitest';
import { getSpaceTreeUuids } from './utils';

const PERSONAL = 'personal';
const spaces = [
    { uuid: 'user-spaces', parentSpaceUuid: null },
    { uuid: PERSONAL, parentSpaceUuid: 'user-spaces' },
    { uuid: 'nested', parentSpaceUuid: PERSONAL },
    { uuid: 'deeply-nested', parentSpaceUuid: 'nested' },
    { uuid: 'other-personal', parentSpaceUuid: 'user-spaces' },
    { uuid: 'shared', parentSpaceUuid: null },
    { uuid: 'shared-child', parentSpaceUuid: 'shared' },
];

describe('getSpaceTreeUuids', () => {
    it('includes the root space itself, even before spaces load', () => {
        expect(getSpaceTreeUuids([], [PERSONAL])).toEqual(new Set([PERSONAL]));
    });

    it('includes spaces nested at any depth and nothing outside the tree', () => {
        expect(getSpaceTreeUuids(spaces, [PERSONAL])).toEqual(
            new Set([PERSONAL, 'nested', 'deeply-nested']),
        );
    });

    it('combines several roots', () => {
        expect(getSpaceTreeUuids(spaces, ['nested', 'shared'])).toEqual(
            new Set(['nested', 'deeply-nested', 'shared', 'shared-child']),
        );
    });

    it('terminates on a parent cycle', () => {
        const cyclic = [
            { uuid: 'a', parentSpaceUuid: 'b' },
            { uuid: 'b', parentSpaceUuid: 'a' },
        ];
        expect(getSpaceTreeUuids(cyclic, ['a'])).toEqual(new Set(['a', 'b']));
    });
});
