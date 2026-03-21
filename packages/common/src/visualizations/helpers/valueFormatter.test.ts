import {
    OTHER_GROUP_DISPLAY_VALUE,
    OTHER_GROUP_SENTINEL_VALUE,
} from '../../types/savedCharts';
import { getFormattedValue } from './valueFormatter';

describe('getFormattedValue', () => {
    it('should return "Other" for the sentinel value', () => {
        const result = getFormattedValue(
            OTHER_GROUP_SENTINEL_VALUE,
            'some_key',
            {},
        );
        expect(result).toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for a normal string value', () => {
        const result = getFormattedValue('North America', 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for null', () => {
        const result = getFormattedValue(null, 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for undefined', () => {
        const result = getFormattedValue(undefined, 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });
});
