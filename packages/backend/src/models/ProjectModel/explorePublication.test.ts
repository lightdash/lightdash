import {
    ExploreType,
    getDeferredExploreName,
    type Explore,
} from '@lightdash/common';
import { validateExplorePublication } from './explorePublication';

const temporary = getDeferredExploreName({ unique_id: 'model.a.b' });
const valid = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tables: {},
} as Explore;

it('allows short generated temporary names only after allocation', () => {
    expect(temporary.length).toBeLessThan(255);
    expect(() =>
        validateExplorePublication({ ...valid, name: temporary }),
    ).toThrow('allocated name');
});

it('does not confuse SQL literals or display text with references', () => {
    const explore = {
        ...valid,
        label: temporary,
        description: temporary,
        tables: {
            orders: {
                name: 'orders',
                dimensions: {
                    literal: { sql: `'${temporary}' /* ${temporary} */` },
                },
            },
        },
    } as unknown as Explore;
    expect(validateExplorePublication(explore)).toBe(explore);
});

it('keeps a broken generated explore hidden and names its source in the error', () => {
    const result = validateExplorePublication({
        ...valid,
        type: ExploreType.PRE_AGGREGATE,
        baseTable: temporary,
        dbtModelIdentity: {
            sourceUuid: 'source-id',
            sourceName: 'finance',
            packageName: 'finance',
            uniqueId: 'model.finance.orders',
            modelName: 'orders',
        },
    });
    expect(result).toMatchObject({
        name: 'orders',
        label: 'Orders',
        type: ExploreType.PRE_AGGREGATE,
        errors: [{ message: expect.stringContaining('source "finance"') }],
    });
    expect(result).not.toHaveProperty('baseTable');
});

it.each(['x__model_202410', 'scores__model_202410', 'customer__model_facade'])(
    'publishes the legitimate model name %s unchanged',
    (name) => {
        const explore = {
            ...valid,
            name,
            baseTable: name,
            tables: {
                [name]: {
                    name,
                    sqlTable: `"public"."${name}"`,
                    dimensions: {
                        id: { sql: `"${name}"."id"` },
                    },
                },
            },
        } as unknown as Explore;
        expect(validateExplorePublication(explore)).toBe(explore);
    },
);
