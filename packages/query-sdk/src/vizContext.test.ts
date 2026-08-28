import {
    type APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
    type DataAppVizContext,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { Transport } from './types';
import {
    buildVizDrillDown,
    buildVizUnderlyingData,
    getFormatted,
    getRaw,
    toVizContextState,
    type DataAppVizContextMessage,
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
        Exclude<keyof DataAppVizContextMessage, 'type'>,
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
        Required<Omit<DataAppVizContextMessage, 'type'>>
    >
> = true;
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
void [
    messageKeysMatchHost,
    messageTypeMatchesHost,
    optionValueTypesMatchHost,
    hostPayloadIsAcceptedBySdk,
    inboundOptionsRemainOptional,
    inboundPaletteRemainsOptional,
    inboundSeriesColorsRemainOptional,
    inboundValueColorsRemainOptional,
];

const row: VizContextRow = {
    orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    orders_count: { value: { raw: 42, formatted: '42' } },
    empty_field: undefined,
};

describe('getFormatted', () => {
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

const message = (
    overrides: Partial<DataAppVizContextMessage>,
): DataAppVizContextMessage => ({
    type: 'lightdash:sdk:data-app-viz-context',
    fieldMapping: { category: 'orders_status' },
    rows: [row],
    ...overrides,
});

describe('toVizContextState', () => {
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
            rows: [],
            options: {},
            colorPalette: [],
            seriesColors: {},
            valueColors: {},
            pivotDetails: null,
            underlyingDataEnabled: false,
            drillDownEnabled: false,
        });
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
});

describe('toVizContextState — underlyingData', () => {
    it('reads enabled:true from the host push', () => {
        expect(
            toVizContextState(message({ underlyingData: { enabled: true } }))
                .underlyingDataEnabled,
        ).toBe(true);
    });

    it('defaults to disabled when the host omits underlyingData (old host)', () => {
        expect(toVizContextState(message({})).underlyingDataEnabled).toBe(
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
        expect(buildVizUnderlyingData(true, supportedTransport).enabled).toBe(
            true,
        );
        expect(buildVizUnderlyingData(false, supportedTransport).enabled).toBe(
            false,
        );
        expect(buildVizUnderlyingData(true, legacyTransport).enabled).toBe(
            false,
        );
        expect(buildVizUnderlyingData(true, partialTransport).enabled).toBe(
            false,
        );
        expect(buildVizUnderlyingData(true, null).enabled).toBe(false);
    });

    it('get() delegates to the transport with { row, metric, limit }', async () => {
        const underlyingData = buildVizUnderlyingData(true, supportedTransport);
        await underlyingData.get({ row, metric: 'value', limit: 100 });
        expect(supportedTransport.getVizUnderlyingData).toHaveBeenCalledWith({
            row,
            metric: 'value',
            limit: 100,
        });
    });

    it('download() splits the intent from the download options', async () => {
        const underlyingData = buildVizUnderlyingData(true, supportedTransport);
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

    it('get() rejects with an actionable message when the host disabled it', async () => {
        await expect(
            buildVizUnderlyingData(false, supportedTransport).get({
                row,
                metric: 'value',
            }),
        ).rejects.toThrow(/not enabled/i);
    });

    it('get() rejects with an upgrade hint on a legacy transport', async () => {
        await expect(
            buildVizUnderlyingData(true, legacyTransport).get({
                row,
                metric: 'value',
            }),
        ).rejects.toThrow(/rebuild the app/i);
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
