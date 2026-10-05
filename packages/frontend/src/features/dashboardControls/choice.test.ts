import { describe, expect, it } from 'vitest';
import {
    getChoiceKey,
    getControlChoiceGroups,
    getControlChoices,
    searchControlChoices,
} from './choice';

const tiles = (count: number) =>
    Array.from({ length: count }, (_, index) => `tile-${index}`);

const fields = {
    options: [
        { id: 'orders_channel', tileUuids: tiles(8) },
        { id: 'orders_status', tileUuids: tiles(8) },
        { id: 'payments_status', tileUuids: tiles(2) },
        { id: 'subscriptions_plan', tileUuids: tiles(1) },
    ],
    items: {
        orders_channel: {
            id: 'orders_channel',
            label: 'Sales channel',
            group: 'Orders',
        },
        orders_status: {
            id: 'orders_status',
            label: 'Order status',
            group: 'Orders',
        },
        payments_status: {
            id: 'payments_status',
            label: 'Order status',
            group: 'Payments',
        },
        subscriptions_plan: {
            id: 'subscriptions_plan',
            label: 'Plan',
            group: 'Subscriptions',
        },
    },
};

const parameters = {
    options: [
        { id: 'status_to_track', tileUuids: tiles(6) },
        { id: 'orders.channel', tileUuids: tiles(8) },
    ],
    items: {
        status_to_track: {
            id: 'status_to_track',
            label: 'Order status to track',
            group: null,
        },
        'orders.channel': {
            id: 'orders.channel',
            label: 'Channel',
            group: 'Orders',
        },
    },
};

const NONE = { options: [], items: {} };

describe('getControlChoices', () => {
    it('lists the fields, then the parameters, each with its most used first', () => {
        const choices = getControlChoices({ fields, parameters });
        expect(choices.map(getChoiceKey)).toEqual([
            'filter:orders_channel',
            'filter:orders_status',
            'filter:payments_status',
            'filter:subscriptions_plan',
            'parameter:orders.channel',
            'parameter:status_to_track',
        ]);
        expect(choices.map((choice) => choice.tileCount)).toEqual([
            8, 8, 2, 1, 8, 6,
        ]);
    });

    it('names a field with its table and a parameter without its model unless two share a name', () => {
        const choices = getControlChoices({ fields, parameters });
        const byKey = Object.fromEntries(
            choices.map((choice) => [getChoiceKey(choice), choice.display]),
        );
        expect(byKey['filter:subscriptions_plan']).toEqual({
            label: 'Plan',
            group: 'Subscriptions',
        });
        expect(byKey['parameter:orders.channel']).toEqual({
            label: 'Channel',
            group: null,
        });
    });

    it('lists fields only when there are no parameters', () => {
        expect(
            getControlChoices({ fields, parameters: NONE }).every(
                (choice) => choice.kind === 'filter',
            ),
        ).toBe(true);
    });

    it('leaves out an option it has no name for', () => {
        expect(
            getControlChoices({
                fields: {
                    options: [{ id: 'unknown', tileUuids: tiles(3) }],
                    items: {},
                },
                parameters: NONE,
            }),
        ).toEqual([]);
    });

    it('keeps a field and a parameter with the same id apart', () => {
        const same = {
            options: [{ id: 'status', tileUuids: tiles(1) }],
            items: { status: { id: 'status', label: 'Status', group: null } },
        };
        expect(
            getControlChoices({ fields: same, parameters: same }).map(
                getChoiceKey,
            ),
        ).toEqual(['filter:status', 'parameter:status']);
    });
});

describe('searchControlChoices', () => {
    const choices = getControlChoices({ fields, parameters });

    it('returns everything for an empty search', () => {
        expect(searchControlChoices(choices, '  ')).toEqual(choices);
    });

    it('matches the name or the table, whatever the case, in the same order', () => {
        expect(
            searchControlChoices(choices, 'STATUS').map(getChoiceKey),
        ).toEqual([
            'filter:orders_status',
            'filter:payments_status',
            'parameter:status_to_track',
        ]);
        expect(
            searchControlChoices(choices, 'payments').map(getChoiceKey),
        ).toEqual(['filter:payments_status']);
    });
});

describe('getControlChoiceGroups', () => {
    const both = getControlChoices({ fields, parameters });
    const keys = (search: string, choices = both) =>
        getControlChoiceGroups(choices, search).map((group) => [
            group.heading,
            group.choices.map(getChoiceKey),
        ]);

    it('puts the fields under "Fields" and the parameters under "Parameters", in that order', () => {
        expect(keys('')).toEqual([
            [
                'Fields',
                [
                    'filter:orders_channel',
                    'filter:orders_status',
                    'filter:payments_status',
                    'filter:subscriptions_plan',
                ],
            ],
            [
                'Parameters',
                ['parameter:orders.channel', 'parameter:status_to_track'],
            ],
        ]);
    });

    it('has no heading when there are only fields to offer', () => {
        const onlyFields = getControlChoices({ fields, parameters: NONE });
        expect(keys('', onlyFields)).toEqual([
            [
                null,
                [
                    'filter:orders_channel',
                    'filter:orders_status',
                    'filter:payments_status',
                    'filter:subscriptions_plan',
                ],
            ],
        ]);
    });

    it('has no heading when there are only parameters to offer', () => {
        const onlyParameters = getControlChoices({ fields: NONE, parameters });
        expect(keys('', onlyParameters)).toEqual([
            [null, ['parameter:orders.channel', 'parameter:status_to_track']],
        ]);
    });

    it('searches within the groups', () => {
        expect(keys('status')).toEqual([
            ['Fields', ['filter:orders_status', 'filter:payments_status']],
            ['Parameters', ['parameter:status_to_track']],
        ]);
    });

    it('leaves out a group with no match and keeps the heading of the other', () => {
        expect(keys('plan')).toEqual([
            ['Fields', ['filter:subscriptions_plan']],
        ]);
        expect(keys('to track')).toEqual([
            ['Parameters', ['parameter:status_to_track']],
        ]);
    });

    it('is empty when nothing matches', () => {
        expect(keys('no such thing')).toEqual([]);
    });
});
