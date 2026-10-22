import { toolVisualizeArgsSchemaPersisted } from './toolVisualizeArgs';

describe('toolVisualizeArgsSchemaPersisted', () => {
    const args = {
        nodeId: 'orders',
        title: 'Orders',
        description: null,
        vizConfig: {
            type: 'table',
            x: null,
            y: null,
            groupBy: null,
            stack: null,
            horizontal: null,
            y2: null,
            labels: null,
        },
    };

    it('reads stored args without a version as version 1', () => {
        expect(toolVisualizeArgsSchemaPersisted.parse(args)).toMatchObject({
            version: 1,
            nodeId: 'orders',
        });
    });

    it('parses stored args stamped version 1', () => {
        expect(
            toolVisualizeArgsSchemaPersisted.parse({ ...args, version: 1 }),
        ).toMatchObject({ version: 1, nodeId: 'orders' });
    });

    it('rejects an unknown version', () => {
        expect(
            toolVisualizeArgsSchemaPersisted.safeParse({ ...args, version: 99 })
                .success,
        ).toBe(false);
    });
});
