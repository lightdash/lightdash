import { describe, expect, it } from 'vitest';
import { groupVersionsByThread } from './groupVersionsByThread';

const v = (version: number, threadNumber: number) => ({
    version,
    threadNumber,
    threadUuid: `thread-${threadNumber}`,
});

describe('groupVersionsByThread', () => {
    it('returns no groups for no versions', () => {
        expect(groupVersionsByThread([])).toEqual([]);
    });

    it('puts versions sharing a thread in one group, newest first', () => {
        expect(groupVersionsByThread([v(1, 1), v(3, 1), v(2, 1)])).toEqual([
            {
                threadUuid: 'thread-1',
                threadNumber: 1,
                versions: [v(3, 1), v(2, 1), v(1, 1)],
            },
        ]);
    });

    it('orders groups by thread number, newest thread first', () => {
        expect(
            groupVersionsByThread([
                v(1, 1),
                v(4, 2),
                v(2, 1),
                v(5, 3),
                v(3, 2),
            ]),
        ).toEqual([
            { threadUuid: 'thread-3', threadNumber: 3, versions: [v(5, 3)] },
            {
                threadUuid: 'thread-2',
                threadNumber: 2,
                versions: [v(4, 2), v(3, 2)],
            },
            {
                threadUuid: 'thread-1',
                threadNumber: 1,
                versions: [v(2, 1), v(1, 1)],
            },
        ]);
    });

    it('orders groups by thread number even when input is ordered otherwise', () => {
        const groups = groupVersionsByThread([v(2, 1), v(1, 2)]);
        expect(groups.map((group) => group.threadNumber)).toEqual([2, 1]);
    });
});
