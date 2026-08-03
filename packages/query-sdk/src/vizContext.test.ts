import {
    type APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
    type DataAppVizContext,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFormatted,
    getRaw,
    toVizContextState,
    type DataAppVizContextMessage,
    type VizContextOptionValue,
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
void [
    messageKeysMatchHost,
    messageTypeMatchesHost,
    optionValueTypesMatchHost,
    hostPayloadIsAcceptedBySdk,
    inboundOptionsRemainOptional,
    inboundPaletteRemainsOptional,
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
        });
    });
});
