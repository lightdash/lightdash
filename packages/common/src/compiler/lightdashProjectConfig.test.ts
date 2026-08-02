import { FilterOperator, type MetricFilterRule } from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import {
    getSpotlightConfigurationForResource,
    resolveAdditionalTimeIntervals,
    resolveGranularityLabels,
} from './lightdashProjectConfig';

describe('getSpotlightConfigurationForResource defaults', () => {
    it('threads defaultSegment and a parsed defaultFilter into spotlight', () => {
        const defaultFilter: MetricFilterRule = {
            id: 'test-id',
            target: { fieldRef: 'status' },
            operator: FilterOperator.EQUALS,
            values: ['active'],
        };
        const result = getSpotlightConfigurationForResource({
            visibility: 'show',
            segmentBy: ['region'],
            defaultSegment: 'region',
            defaultFilter,
        });
        expect(result).toEqual({
            spotlight: {
                visibility: 'show',
                categories: undefined,
                segmentBy: ['region'],
                defaultSegment: 'region',
                defaultFilter,
            },
        });
    });

    it('omits defaults when not provided (no regression for existing configs)', () => {
        const result = getSpotlightConfigurationForResource({
            visibility: 'show',
        });
        expect(result).toEqual({
            spotlight: { visibility: 'show', categories: undefined },
        });
    });

    it('returns an empty object when visibility is undefined', () => {
        expect(
            getSpotlightConfigurationForResource({ defaultSegment: 'region' }),
        ).toEqual({});
    });
});

describe('resolveAdditionalTimeIntervals', () => {
    const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

    afterEach(() => warnSpy.mockClear());
    afterAll(() => warnSpy.mockRestore());

    it('returns empty lists when config is undefined', () => {
        expect(resolveAdditionalTimeIntervals(undefined, {})).toEqual({
            date: [],
            timestamp: [],
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uppercases a standard timestamp grain', () => {
        expect(
            resolveAdditionalTimeIntervals({ timestamp: ['hour'] }, {}),
        ).toEqual({ date: [], timestamp: [TimeFrames.HOUR] });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops a sub-day grain configured under date and warns', () => {
        expect(resolveAdditionalTimeIntervals({ date: ['hour'] }, {})).toEqual({
            date: [],
            timestamp: [],
        });
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps a defined custom granularity key', () => {
        expect(
            resolveAdditionalTimeIntervals(
                { date: ['fiscal_week'] },
                { fiscal_week: { label: 'Fiscal Week', sql: '${COLUMN}' } },
            ),
        ).toEqual({ date: ['fiscal_week'], timestamp: [] });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops an unknown name and warns', () => {
        expect(
            resolveAdditionalTimeIntervals({ timestamp: ['nonsense'] }, {}),
        ).toEqual({ date: [], timestamp: [] });
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});

describe('resolveGranularityLabels', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('returns empty object when config is undefined', () => {
        expect(resolveGranularityLabels(undefined)).toEqual({});
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('keys by uppercased TimeFrames and keeps the label verbatim', () => {
        expect(
            resolveGranularityLabels({ week: 'Week starting Monday' }),
        ).toEqual({ [TimeFrames.WEEK]: 'Week starting Monday' });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops an unknown granularity key and warns', () => {
        expect(resolveGranularityLabels({ nonsense: 'X' })).toEqual({});
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
