import {
    type APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
    type DataAppVizContext,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Transport } from './types';
import {
    buildVizDrillDown,
    buildVizPointMenu,
    buildVizUnderlyingData,
    getFieldLabel,
    getFormatted,
    getRaw,
    resolveSeriesColor,
    resolveValueColor,
    resolveVizFixtureUrl,
    toVizContextState,
    type DataAppVizContextMessage,
    type VizContext,
    type VizContextOptionValue,
    type VizContextPivotDetails,
    type VizContextRow,
} from './vizContext';

type Assert<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;
type IsOptional<T, K extends keyof T> =
    object extends Pick<T, K> ? true : false;
type IsAssignable<From, To> = From extends To ? true : false;

const messageKeysMatchHost: Assert<
    Equal<
        Exclude<keyof DataAppVizContextMessage, 'type' | 'renderId'>,
        keyof DataAppVizContext
    >
> = true;
const messageTypeMatchesHost: Assert<
    Equal<
        DataAppVizContextMessage['type'],
        typeof APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE
    >
> = true;
const optionValueTypesMatchHost: Assert<
    Equal<VizContextOptionValue, DataAppVizOptionValue>
> = true;
const hostPayloadIsAcceptedBySdk: Assert<
    IsAssignable<
        DataAppVizContext,
        Omit<DataAppVizContextMessage, 'type' | 'renderId'>
    >
> = true;
expectTypeOf<VizContext['fieldMapping']>().toEqualTypeOf<
    Record<string, string | string[]>
>();
expectTypeOf<DataAppVizContextMessage['fieldMapping']>().toEqualTypeOf<
    Record<string, string | string[]>
>();
expectTypeOf<Parameters<typeof getFormatted>[1]>().toEqualTypeOf<
    string | string[] | undefined
>();
expectTypeOf<Parameters<typeof getRaw>[1]>().toEqualTypeOf<
    string | string[] | undefined
>();
expectTypeOf<Parameters<typeof resolveValueColor>[1]>().toEqualTypeOf<
    string | string[]
>();
const inboundOptionsRemainOptional: Assert<
    IsOptional<DataAppVizContextMessage, 'options'>
> = true;
const inboundPaletteRemainsOptional: Assert<
    IsOptional<DataAppVizContextMessage, 'colorPalette'>
> = true;
const inboundSeriesColorsRemainOptional: Assert<
    IsOptional<DataAppVizContextMessage, 'seriesColors'>
> = true;
const inboundValueColorsRemainOptional: Assert<
    IsOptional<DataAppVizContextMessage, 'valueColors'>
> = true;
const inboundFieldsRemainOptional: Assert<
    IsOptional<DataAppVizContextMessage, 'fields'>
> = true;
void [
    messageKeysMatchHost,
    messageTypeMatchesHost,
    optionValueTypesMatchHost,
    hostPayloadIsAcceptedBySdk,
    inboundOptionsRemainOptional,
    inboundPaletteRemainsOptional,
    inboundSeriesColorsRemainOptional,
    inboundValueColorsRemainOptional,
    inboundFieldsRemainOptional,
];

const row: VizContextRow = {
    orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    orders_count: { value: { raw: 42, formatted: '42' } },
    empty_field: undefined,
};

describe('getFormatted', () => {
    it('requires selecting a field before reading a multi-field binding', () => {
        expect(getFormatted(row, ['orders_status'])).toBe('');
        expect(getFormatted(row, ['orders_status', 'orders_count'])).toBe('');
    });

    it('accepts a scalar field mapping lookup', () => {
        const fieldMapping: VizContext['fieldMapping'] = {
            status: 'orders_status',
        };
        expect(getFormatted(row, fieldMapping.status)).toBe('Completed');
    });

    it('returns the formatted display string for a bound field', () => {
        expect(getFormatted(row, 'orders_status')).toBe('Completed');
        expect(getFormatted(row, 'orders_count')).toBe('42');
    });

    it('returns an empty string for a missing row, field, or cell', () => {
        expect(getFormatted(undefined, 'orders_count')).toBe('');
        expect(getFormatted(row, undefined)).toBe('');
        expect(getFormatted(row, 'not_a_field')).toBe('');
        expect(getFormatted(row, 'empty_field')).toBe('');
    });
});

describe('getRaw', () => {
    it('requires selecting a field before reading a multi-field binding', () => {
        expect(getRaw(row, ['orders_status'])).toBeNull();
        expect(getRaw(row, ['orders_status', 'orders_count'])).toBeNull();
    });

    it('returns the raw value for a bound field', () => {
        expect(getRaw(row, 'orders_status')).toBe('completed');
        expect(getRaw(row, 'orders_count')).toBe(42);
    });

    it('returns null for a missing row, field, or cell', () => {
        expect(getRaw(undefined, 'orders_count')).toBeNull();
        expect(getRaw(row, undefined)).toBeNull();
        expect(getRaw(row, 'not_a_field')).toBeNull();
        expect(getRaw(row, 'empty_field')).toBeNull();
    });
});

describe('getFieldLabel', () => {
    const context = {
        fields: { orders_total: { label: 'Total order amount' } },
    };

    it('returns the host-resolved label for a bound field', () => {
        expect(getFieldLabel(context, 'orders_total')).toBe(
            'Total order amount',
        );
    });

    it('falls back to the raw field id without metadata', () => {
        expect(getFieldLabel(context, 'orders_status')).toBe('orders_status');
        expect(getFieldLabel({ fields: {} }, 'orders_status')).toBe(
            'orders_status',
        );
    });
});

const message = (
    overrides: Partial<DataAppVizContextMessage>,
): DataAppVizContextMessage => ({
    type: 'lightdash:sdk:data-app-viz-context',
    fieldMapping: { category: 'orders_status' },
    rows: [row],
    ...overrides,
});

describe('toVizContextState', () => {
    it('preserves ordered multi-field mappings alongside scalar bindings', () => {
        const state = toVizContextState(
            message({
                fieldMapping: {
                    category: 'orders_status',
                    values: ['orders_total', 'orders_count', 'orders_average'],
                },
            }),
        );
        expect(state.fieldMapping).toEqual({
            category: 'orders_status',
            values: ['orders_total', 'orders_count', 'orders_average'],
        });
    });

    it('preserves scalar mappings delivered by older hosts', () => {
        expect(toVizContextState(message({})).fieldMapping).toEqual({
            category: 'orders_status',
        });
    });

    it('carries every declared option value through, by type', () => {
        expect(
            toVizContextState(
                message({
                    options: {
                        showLabels: true,
                        barCount: 12,
                        title: 'Revenue',
                        barColor: '#7162FF',
                    },
                }),
            ).options,
        ).toEqual({
            showLabels: true,
            barCount: 12,
            title: 'Revenue',
            barColor: '#7162FF',
        });
    });

    it('defaults options to an empty object when the host omits them', () => {
        expect(toVizContextState(message({})).options).toEqual({});
    });

    it('falls back to an empty object for a non-object options payload', () => {
        expect(
            toVizContextState(message({ options: ['not-an-object'] as never }))
                .options,
        ).toEqual({});
        expect(
            toVizContextState(message({ options: 'nope' as never })).options,
        ).toEqual({});
        expect(
            toVizContextState(message({ options: null as never })).options,
        ).toEqual({});
    });

    it('drops invalid option members while preserving valid primitives', () => {
        expect(
            toVizContextState(
                message({
                    options: {
                        enabled: true,
                        count: 12,
                        title: 'Revenue',
                        array: [] as never,
                        object: {} as never,
                        absent: null as never,
                        notANumber: Number.NaN,
                        infinite: Number.POSITIVE_INFINITY,
                    },
                }),
            ).options,
        ).toEqual({
            enabled: true,
            count: 12,
            title: 'Revenue',
        });
    });

    it('carries the host-resolved palette through', () => {
        expect(
            toVizContextState(message({ colorPalette: ['#111', '#222'] }))
                .colorPalette,
        ).toEqual(['#111', '#222']);
    });

    it('falls back to an empty palette when the host omits or malforms it', () => {
        expect(
            toVizContextState(message({ colorPalette: undefined }))
                .colorPalette,
        ).toEqual([]);
        expect(
            toVizContextState(message({ colorPalette: 'nope' as never }))
                .colorPalette,
        ).toEqual([]);
        expect(
            toVizContextState(
                message({ colorPalette: ['#111', null as never, '#222'] }),
            ).colorPalette,
        ).toEqual(['#111', '#222']);
    });

    it('normalizes host-resolved series and value colors', () => {
        const state = toVizContextState(
            message({
                seriesColors: {
                    count_completed: '#00ff00',
                    invalid: 42 as never,
                },
                valueColors: {
                    orders_status: {
                        completed: '#00ff00',
                        invalid: null as never,
                    },
                    invalid: [] as never,
                },
            }),
        );

        expect(state.seriesColors).toEqual({
            count_completed: '#00ff00',
        });
        expect(state.valueColors).toEqual({
            orders_status: { completed: '#00ff00' },
        });
    });

    it('defaults resolved colors to empty maps for older hosts', () => {
        const state = toVizContextState(message({}));

        expect(state.seriesColors).toEqual({});
        expect(state.valueColors).toEqual({});
    });

    it('still normalises fieldMapping and rows', () => {
        expect(
            toVizContextState(
                message({
                    fieldMapping: undefined,
                    rows: undefined,
                }),
            ),
        ).toEqual({
            fieldMapping: {},
            fields: {},
            rows: [],
            options: {},
            colorPalette: [],
            seriesColors: {},
            valueColors: {},
            pivotDetails: null,
            underlyingDataEnabled: false,
            underlyingDataOpenEnabled: false,
            drillDownEnabled: false,
            pointMenuEnabled: false,
        });
    });

    it('keeps well-formed field metadata and drops malformed entries', () => {
        const state = toVizContextState(
            message({
                fields: {
                    orders_total: {
                        label: 'Total order amount',
                        tableLabel: 'Orders',
                        format: { type: 'currency', currency: 'USD' },
                    },
                    orders_status: { label: 'Status' },
                    no_label: { tableLabel: 'Orders' } as never,
                    bad_format: {
                        label: 'Bad format',
                        format: { round: 2 } as never,
                    },
                    not_an_object: 'label' as never,
                },
            }),
        );

        expect(state.fields).toEqual({
            orders_total: {
                label: 'Total order amount',
                tableLabel: 'Orders',
                format: { type: 'currency', currency: 'USD' },
            },
            orders_status: { label: 'Status' },
            bad_format: { label: 'Bad format' },
        });
    });

    it('defaults missing field metadata to an empty map for older hosts', () => {
        expect(toVizContextState(message({})).fields).toEqual({});
        expect(
            toVizContextState(message({ fields: [] as never })).fields,
        ).toEqual({});
    });

    it('normalizes pivot metadata used to resolve generated columns', () => {
        const pivotDetails = {
            totalColumnCount: 2,
            indexColumn: {
                reference: 'orders_created_date',
                type: 'time',
            },
            valuesColumns: [
                {
                    referenceField: 'orders_total',
                    pivotColumnName: 'orders_total__status_shipped',
                    aggregation: 'any',
                    pivotValues: [
                        {
                            referenceField: 'orders_status',
                            value: 'shipped',
                            formatted: 'Shipped',
                        },
                    ],
                },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: [
                {
                    reference: 'orders_created_date',
                    direction: 'ASC',
                },
            ],
            originalColumns: {
                orders_created_date: {
                    reference: 'orders_created_date',
                    type: 'date',
                },
            },
            passthroughDimensions: [{ reference: 'orders_image_url' }],
        } satisfies VizContextPivotDetails;

        expect(
            toVizContextState(message({ pivotDetails })).pivotDetails,
        ).toEqual(pivotDetails);
    });

    it('defaults missing pivot metadata to null', () => {
        expect(toVizContextState(message({})).pivotDetails).toBeNull();
    });

    it('maps pointMenu.enabled and defaults it off for older hosts', () => {
        expect(
            toVizContextState(message({ pointMenu: { enabled: true } }))
                .pointMenuEnabled,
        ).toBe(true);
        expect(toVizContextState(message({})).pointMenuEnabled).toBe(false);
    });
});

describe('resolveVizFixtureUrl', () => {
    const at = (parts: { hash?: string; search?: string }) => ({
        hash: parts.hash ?? '',
        search: parts.search ?? '',
        origin: 'http://127.0.0.1:5173',
    });

    it('returns null when the param is absent', () => {
        expect(resolveVizFixtureUrl(at({}))).toBeNull();
        expect(resolveVizFixtureUrl(at({ search: '?other=1' }))).toBeNull();
    });

    it('resolves a relative path against the page origin', () => {
        expect(
            resolveVizFixtureUrl(
                at({ search: '?vizFixture=/my-fixture.json' }),
            ),
        ).toBe('http://127.0.0.1:5173/my-fixture.json');
    });

    it('defaults a bare param to the conventional fixture path', () => {
        expect(resolveVizFixtureUrl(at({ search: '?vizFixture=' }))).toBe(
            'http://127.0.0.1:5173/viz-fixture.json',
        );
    });

    it('prefers the hash over the search param (host-forwarded seed wins)', () => {
        expect(
            resolveVizFixtureUrl(
                at({
                    hash: '#vizFixture=/from-hash.json',
                    search: '?vizFixture=/from-search.json',
                }),
            ),
        ).toBe('http://127.0.0.1:5173/from-hash.json');
    });

    it('rejects a cross-origin fixture target', () => {
        expect(
            resolveVizFixtureUrl(
                at({ search: '?vizFixture=https://evil.example/x.json' }),
            ),
        ).toBeNull();
        expect(
            resolveVizFixtureUrl(
                at({ search: '?vizFixture=//evil.example/x' }),
            ),
        ).toBeNull();
    });
});

describe('resolved color helpers', () => {
    const context = {
        colorPalette: ['#111111', '#222222'],
        seriesColors: { count_completed: '#00ff00' },
        valueColors: { orders_status: { completed: '#00ff00' } },
    };

    it('uses the host-resolved pivot-column color before the palette', () => {
        expect(
            resolveSeriesColor(
                context,
                { pivotColumnName: 'count_completed' },
                1,
            ),
        ).toBe('#00ff00');
        expect(
            resolveSeriesColor(
                context,
                { pivotColumnName: 'count_pending' },
                1,
            ),
        ).toBe('#222222');
    });

    it('uses the host-resolved raw-value color before the palette', () => {
        expect(
            resolveValueColor(context, 'orders_status', 'completed', 1),
        ).toBe('#00ff00');
        expect(resolveValueColor(context, 'orders_status', 'pending', 1)).toBe(
            '#222222',
        );
    });

    it('stringifies non-string raw values and tolerates an empty palette', () => {
        expect(
            resolveValueColor(
                {
                    colorPalette: [],
                    seriesColors: {},
                    valueColors: { orders_priority: { '1': '#abcdef' } },
                },
                'orders_priority',
                1,
                0,
            ),
        ).toBe('#abcdef');
        expect(
            resolveSeriesColor(
                { colorPalette: [], seriesColors: {}, valueColors: {} },
                { pivotColumnName: 'missing' },
                0,
            ),
        ).toBeUndefined();
    });
});

describe('toVizContextState — underlyingData', () => {
    it('reads legacy fetch and host-dialog availability independently', () => {
        const state = toVizContextState(
            message({
                underlyingData: { enabled: true, openEnabled: true },
            }),
        );
        expect(state.underlyingDataEnabled).toBe(true);
        expect(state.underlyingDataOpenEnabled).toBe(true);
    });

    it('defaults to disabled when the host omits underlyingData (old host)', () => {
        expect(toVizContextState(message({})).underlyingDataEnabled).toBe(
            false,
        );
        expect(toVizContextState(message({})).underlyingDataOpenEnabled).toBe(
            false,
        );
    });

    it('treats non-boolean enabled values as disabled (untrusted payload)', () => {
        expect(
            toVizContextState(
                message({ underlyingData: { enabled: 'yes' as never } }),
            ).underlyingDataEnabled,
        ).toBe(false);
        expect(
            toVizContextState(message({ underlyingData: {} as never }))
                .underlyingDataEnabled,
        ).toBe(false);
    });
});

describe('buildVizUnderlyingData', () => {
    const supportedTransport = {
        openVizUnderlyingData: vi.fn(async () => undefined),
        getVizUnderlyingData: vi.fn(async () => ({
            rows: [],
            columns: [],
            format: () => '',
            queryUuid: 'q2',
        })),
        downloadVizUnderlyingData: vi.fn(async () => ({
            queryUuid: 'q2',
            jobId: 'j1',
            fileUrl: 'https://files/x.csv',
            fileType: 'csv' as const,
            truncated: false,
        })),
    } as unknown as Transport;

    const legacyTransport = {} as Transport;
    // A custom transport implementing get but not download must not advertise
    // the capability — the generated menu promises a Download button.
    const partialTransport = {
        getVizUnderlyingData: vi.fn(),
    } as unknown as Transport;

    it('enabled only when the host pushed enabled AND the transport supports it', () => {
        expect(
            buildVizUnderlyingData(true, true, supportedTransport).enabled,
        ).toBe(true);
        expect(
            buildVizUnderlyingData(true, false, supportedTransport).enabled,
        ).toBe(false);
        expect(
            buildVizUnderlyingData(true, true, legacyTransport).enabled,
        ).toBe(false);
        expect(
            buildVizUnderlyingData(true, true, partialTransport).enabled,
        ).toBe(false);
        expect(buildVizUnderlyingData(true, true, null).enabled).toBe(false);
    });

    it('get() delegates to the transport with { row, metric, limit }', async () => {
        const underlyingData = buildVizUnderlyingData(
            true,
            true,
            supportedTransport,
        );
        await underlyingData.get({ row, metric: 'value', limit: 100 });
        expect(supportedTransport.getVizUnderlyingData).toHaveBeenCalledWith({
            row,
            metric: 'value',
            limit: 100,
        });
    });

    it('keeps legacy get() available when the host cannot open its dialog', async () => {
        const underlyingData = buildVizUnderlyingData(
            true,
            false,
            supportedTransport,
        );
        expect(underlyingData.enabled).toBe(false);

        await underlyingData.get({ row, metric: 'value' });

        expect(supportedTransport.getVizUnderlyingData).toHaveBeenCalledWith({
            row,
            metric: 'value',
            limit: undefined,
        });
    });

    it('download() splits the intent from the download options', async () => {
        const underlyingData = buildVizUnderlyingData(
            true,
            true,
            supportedTransport,
        );
        await underlyingData.download({
            row,
            metric: 'value',
            fileType: 'xlsx',
            autoDownload: false,
        });
        expect(
            supportedTransport.downloadVizUnderlyingData,
        ).toHaveBeenCalledWith(
            { row, metric: 'value' },
            { fileType: 'xlsx', autoDownload: false },
        );
    });

    it('open() delegates the semantic click intent to the host', async () => {
        const underlyingData = buildVizUnderlyingData(
            true,
            true,
            supportedTransport,
        );
        await underlyingData.open({ row, metric: 'value' });
        expect(supportedTransport.openVizUnderlyingData).toHaveBeenCalledWith({
            row,
            metric: 'value',
        });
    });

    it('forwards the selected field id for a multi-metric slot', async () => {
        const underlyingData = buildVizUnderlyingData(
            true,
            true,
            supportedTransport,
        );
        await underlyingData.open({
            row,
            metric: 'values',
            fieldId: 'orders_count',
        });
        expect(supportedTransport.openVizUnderlyingData).toHaveBeenCalledWith({
            row,
            metric: 'values',
            fieldId: 'orders_count',
        });
    });

    it('get() rejects with an actionable message when the host disabled it', async () => {
        await expect(
            buildVizUnderlyingData(false, true, supportedTransport).get({
                row,
                metric: 'value',
            }),
        ).rejects.toThrow(/not enabled/i);
    });

    it('get() rejects with an upgrade hint on a legacy transport', async () => {
        await expect(
            buildVizUnderlyingData(true, true, legacyTransport).get({
                row,
                metric: 'value',
            }),
        ).rejects.toThrow(/rebuild the app/i);
    });

    it('open() rejects when the host cannot own the dialog', async () => {
        await expect(
            buildVizUnderlyingData(true, false, supportedTransport).open({
                row,
                metric: 'value',
            }),
        ).rejects.toThrow(/not enabled/i);
    });
});

const drillMessage = (
    drillDown?: Record<string, unknown>,
): DataAppVizContextMessage =>
    ({
        type: 'lightdash:sdk:data-app-viz-context',
        fieldMapping: {},
        rows: [],
        ...(drillDown !== undefined ? { drillDown } : {}),
    }) as DataAppVizContextMessage;

describe('toVizContextState drill-down flag', () => {
    it('reads drillDown.enabled strictly', () => {
        expect(
            toVizContextState(drillMessage({ enabled: true })).drillDownEnabled,
        ).toBe(true);
        expect(toVizContextState(drillMessage()).drillDownEnabled).toBe(false);
        expect(
            toVizContextState(drillMessage({ enabled: 'yes' }))
                .drillDownEnabled,
        ).toBe(false);
    });
});

describe('buildVizDrillDown', () => {
    const transportWith = (open?: Transport['openVizDrillDown']) =>
        ({ openVizDrillDown: open }) as unknown as Transport;

    it('is enabled only when the host flag and transport method are both present', () => {
        const open = vi.fn().mockResolvedValue(undefined);
        expect(buildVizDrillDown(true, transportWith(open)).enabled).toBe(true);
        expect(buildVizDrillDown(false, transportWith(open)).enabled).toBe(
            false,
        );
        expect(buildVizDrillDown(true, transportWith(undefined)).enabled).toBe(
            false,
        );
        expect(buildVizDrillDown(true, null).enabled).toBe(false);
    });

    it('open() forwards the intent through the transport', async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const row = { m: { value: { raw: 1, formatted: '1' } } };
        await buildVizDrillDown(true, transportWith(open)).open({
            row,
            metric: 'value',
        });
        expect(open).toHaveBeenCalledWith({ row, metric: 'value' });
    });

    it('forwards a selected field id for a multi-metric slot', async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const row = { m: { value: { raw: 1, formatted: '1' } } };
        await buildVizDrillDown(true, transportWith(open)).open({
            row,
            metric: 'values',
            fieldId: 'orders_count',
        });
        expect(open).toHaveBeenCalledWith({
            row,
            metric: 'values',
            fieldId: 'orders_count',
        });
    });

    it('open() rejects with clear messages when disabled or unsupported', async () => {
        await expect(
            buildVizDrillDown(false, transportWith(vi.fn())).open({
                row: {},
                metric: 'value',
            }),
        ).rejects.toThrow('Drill-down is not enabled for this visualization.');
        await expect(
            buildVizDrillDown(true, transportWith(undefined)).open({
                row: {},
                metric: 'value',
            }),
        ).rejects.toThrow(
            'This SDK build predates drill-down. Rebuild the app on the current template.',
        );
    });
});

describe('buildVizPointMenu', () => {
    const transportWith = (impl?: Transport['openVizPointMenu']) =>
        ({ openVizPointMenu: impl }) as unknown as Transport;

    it('is disabled when the host does not enable it', () => {
        const surface = buildVizPointMenu(false, transportWith(vi.fn()));
        expect(surface.enabled).toBe(false);
    });

    it('is disabled when the transport predates the capability', () => {
        const surface = buildVizPointMenu(true, {} as Transport);
        expect(surface.enabled).toBe(false);
    });

    it('posts the intent through the transport and returns shown', async () => {
        const open = vi.fn().mockResolvedValue({ shown: true });
        const surface = buildVizPointMenu(true, transportWith(open));
        await expect(
            surface.open({ x: 12, y: 34, row: {}, metric: 'value' }),
        ).resolves.toEqual({ shown: true });
        expect(open).toHaveBeenCalledWith({
            x: 12,
            y: 34,
            row: {},
            metric: 'value',
        });
    });

    it('throws the rebuild message on an old transport', async () => {
        const surface = buildVizPointMenu(true, {} as Transport);
        await expect(
            surface.open({ x: 0, y: 0, row: {}, metric: 'value' }),
        ).rejects.toThrow(/predates the data point menu/);
    });
});

describe('resolveValueColor multi-field bindings', () => {
    it('requires selecting a field before resolving its value color', () => {
        expect(
            resolveValueColor(
                {
                    colorPalette: ['#123456'],
                    seriesColors: {},
                    valueColors: {},
                },
                ['orders_status'],
                'completed',
                0,
            ),
        ).toBeUndefined();
    });
});
