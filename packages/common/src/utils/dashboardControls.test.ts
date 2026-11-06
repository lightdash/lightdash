import { describe, expect, it } from 'vitest';
import {
    DashboardControlRefKind,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardParameterControl,
} from '../types/dashboard';
import { FilterOperator, type DashboardFilterRule } from '../types/filter';
import {
    getDashboardFilterSlugs,
    reconcileDashboardControlOrder,
    type DashboardControlSources,
} from './dashboardControls';

const { FILTER, PARAMETER, SECTION, DATE_ZOOM } = DashboardControlRefKind;

const rule = (
    id: string,
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    ...extra,
});

const parameter = (
    id: string,
    extra: Partial<DashboardParameterControl> = {},
): DashboardParameterControl => ({
    id,
    label: id,
    value: null,
    valueType: { type: 'string', multiple: false },
    parameters: {},
    ...extra,
});

const section = (id: string): DashboardControlSection => ({ id, name: id });

const sources = (
    extra: Partial<DashboardControlSources> = {},
): DashboardControlSources => ({
    controlOrder: undefined,
    filters: { dimensions: [], metrics: [] },
    parameterControls: [],
    sections: [],
    ...extra,
});

const order = (input: DashboardControlSources) =>
    reconcileDashboardControlOrder(input).map(
        ({ kind, id }) => `${kind}:${id}`,
    );

const ref = (
    kind: DashboardControlRefKind,
    id: string,
): DashboardControlRef => ({
    kind,
    id,
});

const full = sources({
    filters: {
        dimensions: [rule('d1'), rule('d2', { sectionId: 's1' }), rule('d3')],
        metrics: [rule('m1'), rule('m2', { sectionId: 's1' })],
    },
    parameterControls: [parameter('p1'), parameter('p2', { sectionId: 's2' })],
    sections: [section('s1'), section('s2')],
});

// An editor moved s2 first: the save writes both the array and the list
const movedS2 = { ...full, sections: [section('s2'), section('s1')] };

const defaultOrder = [
    'filter:d1',
    'filter:d3',
    'filter:m1',
    'parameter:p1',
    'section:s1',
    'filter:d2',
    'filter:m2',
    'section:s2',
    'parameter:p2',
];

describe('reconcileDashboardControlOrder', () => {
    it('returns nothing for an empty dashboard', () => {
        expect(order(sources())).toEqual([]);
        expect(order(sources({ controlOrder: [] }))).toEqual([]);
    });

    it('uses the default order when the list is absent or empty', () => {
        expect(order(full)).toEqual(defaultOrder);
        expect(order({ ...full, controlOrder: [] })).toEqual(defaultOrder);
    });

    it('interleaves kinds and places sections as the list says', () => {
        expect(
            order({
                ...movedS2,
                controlOrder: [
                    ref(SECTION, 's2'),
                    ref(PARAMETER, 'p1'),
                    ref(FILTER, 'm1'),
                    ref(FILTER, 'd1'),
                    ref(PARAMETER, 'p2'),
                    ref(SECTION, 's1'),
                    ref(FILTER, 'm2'),
                    ref(FILTER, 'd2'),
                    ref(FILTER, 'd3'),
                ],
            }),
        ).toEqual([
            'section:s2',
            'parameter:p2',
            'parameter:p1',
            'filter:m1',
            'filter:d1',
            'section:s1',
            'filter:m2',
            'filter:d2',
            'filter:d3',
        ]);
    });

    it('orders sections by the sections array, whatever the list says', () => {
        expect(
            order({
                ...full,
                controlOrder: [ref(SECTION, 's2'), ref(SECTION, 's1')],
            }),
        ).toEqual([
            'section:s1',
            'filter:d2',
            'filter:m2',
            'section:s2',
            'parameter:p2',
            'filter:d1',
            'filter:d3',
            'filter:m1',
            'parameter:p1',
        ]);
    });

    it('drops dangling, duplicate and unknown-kind refs', () => {
        expect(
            order({
                ...full,
                controlOrder: [
                    ref(SECTION, 'gone'),
                    ref(FILTER, 'm1'),
                    ref(FILTER, 'm1'),
                    { kind: 'chart' as DashboardControlRefKind, id: 'd1' },
                    ref(PARAMETER, 'd1'),
                    ref(DATE_ZOOM, 'z1'),
                ],
            }),
        ).toEqual([
            'filter:m1',
            'filter:d1',
            'filter:d3',
            'parameter:p1',
            'section:s1',
            'filter:d2',
            'filter:m2',
            'section:s2',
            'parameter:p2',
        ]);
    });

    it('ignores malformed refs', () => {
        expect(
            order({
                ...full,
                controlOrder: [
                    null,
                    'filter:m1',
                    { kind: FILTER },
                ] as unknown as DashboardControlRef[],
            }),
        ).toEqual(defaultOrder);
    });

    it('appends unmentioned controls to the end of their container', () => {
        expect(
            order({
                ...movedS2,
                controlOrder: [
                    ref(SECTION, 's2'),
                    ref(FILTER, 'm2'),
                    ref(PARAMETER, 'p1'),
                ],
            }),
        ).toEqual([
            'section:s2',
            'parameter:p2',
            'parameter:p1',
            'filter:d1',
            'filter:d3',
            'filter:m1',
            'section:s1',
            'filter:m2',
            'filter:d2',
        ]);
    });

    it('refills each kind from its own array when the arrays are reordered', () => {
        const list = [
            ref(FILTER, 'd1'),
            ref(PARAMETER, 'p1'),
            ref(FILTER, 'd3'),
            ref(FILTER, 'm1'),
            ref(PARAMETER, 'p3'),
        ];
        const before = sources({
            controlOrder: list,
            filters: {
                dimensions: [rule('d1'), rule('d3')],
                metrics: [rule('m1')],
            },
            parameterControls: [parameter('p1'), parameter('p3')],
        });
        expect(order(before)).toEqual([
            'filter:d1',
            'parameter:p1',
            'filter:d3',
            'filter:m1',
            'parameter:p3',
        ]);
        expect(
            order({
                ...before,
                filters: {
                    dimensions: [rule('d3'), rule('d1')],
                    metrics: [rule('m1')],
                },
                parameterControls: [parameter('p3'), parameter('p1')],
            }),
        ).toEqual([
            'filter:d3',
            'parameter:p3',
            'filter:d1',
            'filter:m1',
            'parameter:p1',
        ]);
    });

    it('refills dimension and metric filters separately', () => {
        expect(
            order(
                sources({
                    controlOrder: [
                        ref(FILTER, 'm1'),
                        ref(FILTER, 'd1'),
                        ref(FILTER, 'm2'),
                    ],
                    filters: {
                        dimensions: [rule('d1')],
                        metrics: [rule('m2'), rule('m1')],
                    },
                }),
            ),
        ).toEqual(['filter:m2', 'filter:d1', 'filter:m1']);
    });

    it('takes membership from sectionId, not from where the list puts it', () => {
        expect(
            order({
                ...movedS2,
                controlOrder: [
                    ref(FILTER, 'd2'),
                    ref(SECTION, 's2'),
                    ref(FILTER, 'd1'),
                    ref(SECTION, 's1'),
                    ref(PARAMETER, 'p2'),
                ],
            }),
        ).toEqual([
            'section:s2',
            'parameter:p2',
            'filter:d1',
            'section:s1',
            'filter:d2',
            'filter:m2',
            'filter:d3',
            'filter:m1',
            'parameter:p1',
        ]);
    });

    it('treats a dangling sectionId as unsectioned', () => {
        expect(
            order(
                sources({
                    filters: {
                        dimensions: [rule('d1', { sectionId: 'gone' })],
                        metrics: [],
                    },
                    parameterControls: [parameter('p1', { sectionId: 'gone' })],
                }),
            ),
        ).toEqual(['filter:d1', 'parameter:p1']);
    });

    it('keeps two controls of one kind sharing an id', () => {
        expect(
            order(
                sources({
                    controlOrder: [ref(FILTER, 'x')],
                    filters: { dimensions: [rule('x')], metrics: [rule('x')] },
                }),
            ),
        ).toEqual(['filter:x', 'filter:x']);
    });

    it('builds the envelope from each kind', () => {
        const [param, sec, filter] = reconcileDashboardControlOrder(
            sources({
                filters: {
                    dimensions: [
                        rule('d1', { label: 'Status', sectionId: 's1' }),
                    ],
                    metrics: [],
                },
                parameterControls: [
                    parameter('p1', { slug: 'region', hidden: true }),
                ],
                sections: [{ ...section('s1'), slug: 'main' }],
                controlOrder: [
                    ref(FILTER, 'd1'),
                    ref(PARAMETER, 'p1'),
                    ref(SECTION, 's1'),
                ],
            }),
        );
        expect(param).toMatchObject({
            kind: PARAMETER,
            id: 'p1',
            slug: 'region',
            sectionId: null,
            label: 'p1',
            hidden: true,
        });
        expect(sec).toMatchObject({
            kind: SECTION,
            slug: 'main',
            label: 's1',
            sectionId: null,
        });
        expect(filter).toMatchObject({
            kind: FILTER,
            id: 'd1',
            slug: 'orders-d1',
            sectionId: 's1',
            label: 'Status',
            hidden: false,
            group: 'dimensions',
        });
    });
});

describe('getDashboardFilterSlugs', () => {
    const target = (fieldId: string) => ({ fieldId, tableName: 'orders' });

    it('derives from the field, suffixing every repeat in array order', () => {
        expect(
            getDashboardFilterSlugs([
                { target: target('orders_status') },
                { target: target('orders_status') },
                { target: target('orders_status') },
            ]),
        ).toEqual(['orders-status-1', 'orders-status-2', 'orders-status-3']);
    });

    it('keeps a stored slug and derives around it', () => {
        expect(
            getDashboardFilterSlugs([
                { target: target('orders_status') },
                { target: target('orders_status'), slug: 'orders-status' },
                { target: target('orders_status'), slug: 'kept' },
            ]),
        ).toEqual(['orders-status-1', 'orders-status', 'kept']);
    });

    it('falls back when the field has no usable characters', () => {
        expect(getDashboardFilterSlugs([{ target: target('__') }])).toEqual([
            'filter',
        ]);
    });
});
