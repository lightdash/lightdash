import {
    planExploreNameClaims,
    type ExploreNamePolicyModel,
} from './exploreNameReservationPolicy';

const model = (
    sourceKey: string,
    modelName = 'orders',
    packageName = 'package',
    uniqueId = `model.${packageName}.${modelName}`,
): ExploreNamePolicyModel => ({
    ownerKey: JSON.stringify([sourceKey, packageName, uniqueId, modelName]),
    sourceKey,
    modelName,
});

const first = model('source-a');
const second = model('source-b');
const third = model('source-c');
const qualifiedOwners = [
    { name: 'alpha__orders', ownerKey: first.ownerKey },
    { name: 'beta__orders', ownerKey: second.ownerKey },
];

describe('planExploreNameClaims', () => {
    test('reserves the plain name and leaves both new sources to qualified claims', () => {
        expect(
            planExploreNameClaims({
                candidates: [first, second],
                savedModels: [],
                allocations: [],
            }),
        ).toEqual({ reservations: ['orders'], plainClaims: [] });
    });

    test('keeps a saved plain owner and leaves only the newcomer to a qualified claim', () => {
        expect(
            planExploreNameClaims({
                candidates: [first, second],
                savedModels: [first],
                allocations: [{ name: 'orders', ownerKey: first.ownerKey }],
            }),
        ).toEqual({ reservations: [], plainClaims: [] });
    });

    test('prevents a third source from claiming a reserved plain name', () => {
        expect(
            planExploreNameClaims({
                candidates: [third],
                savedModels: [first, second],
                allocations: [
                    ...qualifiedOwners,
                    { name: 'orders', ownerKey: null },
                ],
            }),
        ).toEqual({ reservations: [], plainClaims: [] });
    });

    test.each([
        { candidates: [] },
        { candidates: [first, second] },
        { candidates: [third] },
    ])(
        'adds a missing reservation for saved qualified owners with candidates $candidates',
        ({ candidates }) => {
            expect(
                planExploreNameClaims({
                    candidates,
                    savedModels: [first, second],
                    allocations: qualifiedOwners,
                }),
            ).toEqual({ reservations: ['orders'], plainClaims: [] });
        },
    );

    test('counts a saved qualified owner when another source arrives', () => {
        expect(
            planExploreNameClaims({
                candidates: [second],
                savedModels: [first],
                allocations: [qualifiedOwners[0]],
            }),
        ).toEqual({ reservations: ['orders'], plainClaims: [] });
    });

    test.each([
        { candidates: [] },
        { candidates: [first] },
        { candidates: [third] },
    ])(
        'retains a reservation after owners are removed with candidates $candidates',
        ({ candidates }) => {
            expect(
                planExploreNameClaims({
                    candidates,
                    savedModels: [],
                    allocations: [{ name: 'orders', ownerKey: null }],
                }),
            ).toEqual({ reservations: [], plainClaims: [] });
        },
    );

    test('allows a fresh single source to claim the plain name', () => {
        expect(
            planExploreNameClaims({
                candidates: [first],
                savedModels: [],
                allocations: [],
            }),
        ).toEqual({
            reservations: [],
            plainClaims: [{ ownerKey: first.ownerKey, name: 'orders' }],
        });
    });

    test('counts distinct sources rather than duplicate nodes or packages in one source', () => {
        const otherPackage = model('source-a', 'orders', 'other-package');
        const otherNode = model(
            'source-a',
            'orders',
            'package',
            'model.package.other-orders',
        );
        const candidates = [first, first, otherPackage, otherNode];
        const plan = planExploreNameClaims({
            candidates,
            savedModels: [first, first],
            allocations: [],
        });
        expect(plan.reservations).toEqual([]);
        expect(plan.plainClaims).toHaveLength(1);
        expect(plan.plainClaims[0].name).toBe('orders');
        expect(
            planExploreNameClaims({
                candidates: [...candidates, second],
                savedModels: [first],
                allocations: [],
            }),
        ).toEqual({ reservations: ['orders'], plainClaims: [] });
    });

    test('does not move a saved qualified owner to an available plain name', () => {
        expect(
            planExploreNameClaims({
                candidates: [first],
                savedModels: [first],
                allocations: [qualifiedOwners[0]],
            }),
        ).toEqual({ reservations: [], plainClaims: [] });
    });

    test('sorts reservations and claims independently of source and node order', () => {
        const candidates = [
            second,
            first,
            model('source-b', 'accounts'),
            model('source-a', 'accounts'),
            model('source-a', 'items', 'z-package'),
            model('source-a', 'items', 'a-package'),
        ];
        const forward = planExploreNameClaims({
            candidates,
            savedModels: [first, second],
            allocations: qualifiedOwners,
        });
        const reversed = planExploreNameClaims({
            candidates: [...candidates].reverse(),
            savedModels: [second, first],
            allocations: [...qualifiedOwners].reverse(),
        });
        expect(forward).toEqual(reversed);
        expect(forward).toEqual({
            reservations: ['accounts', 'orders'],
            plainClaims: [
                {
                    ownerKey: model('source-a', 'items', 'a-package').ownerKey,
                    name: 'items',
                },
            ],
        });
    });
});
