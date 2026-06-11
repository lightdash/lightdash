import { FilterOperator, type MetricFilterRule } from '../types/filter';
import { getSpotlightConfigurationForResource } from './lightdashProjectConfig';

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
