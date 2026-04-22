import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { timeIntervalToExcelNumFmt } from './pivotQueryResults';

describe('timeIntervalToExcelNumFmt', () => {
    it('YEAR → yyyy', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.YEAR, DimensionType.DATE),
        ).toBe('yyyy');
    });

    it('MONTH → yyyy-mm', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.MONTH, DimensionType.DATE),
        ).toBe('yyyy-mm');
    });

    it('DAY → yyyy-mm-dd', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.DAY, DimensionType.DATE),
        ).toBe('yyyy-mm-dd');
    });

    it('HOUR → yyyy-mm-dd hh:00', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.HOUR, DimensionType.TIMESTAMP),
        ).toBe('yyyy-mm-dd hh:00');
    });

    it('MINUTE → yyyy-mm-dd hh:mm', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.MINUTE,
                DimensionType.TIMESTAMP,
            ),
        ).toBe('yyyy-mm-dd hh:mm');
    });

    it('SECOND → yyyy-mm-dd hh:mm:ss', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.SECOND,
                DimensionType.TIMESTAMP,
            ),
        ).toBe('yyyy-mm-dd hh:mm:ss');
    });

    it('MILLISECOND → yyyy-mm-dd hh:mm:ss.000', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.MILLISECOND,
                DimensionType.TIMESTAMP,
            ),
        ).toBe('yyyy-mm-dd hh:mm:ss.000');
    });

    it('RAW + DATE → yyyy-mm-dd', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.RAW, DimensionType.DATE),
        ).toBe('yyyy-mm-dd');
    });

    it('RAW + TIMESTAMP → yyyy-mm-dd hh:mm:ss', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.RAW, DimensionType.TIMESTAMP),
        ).toBe('yyyy-mm-dd hh:mm:ss');
    });

    it('undefined + DATE → yyyy-mm-dd', () => {
        expect(timeIntervalToExcelNumFmt(undefined, DimensionType.DATE)).toBe(
            'yyyy-mm-dd',
        );
    });

    it('undefined + TIMESTAMP → yyyy-mm-dd hh:mm:ss', () => {
        expect(
            timeIntervalToExcelNumFmt(undefined, DimensionType.TIMESTAMP),
        ).toBe('yyyy-mm-dd hh:mm:ss');
    });

    it('WEEK → null (non-native)', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.WEEK, DimensionType.DATE),
        ).toBeNull();
    });

    it('QUARTER → null (non-native)', () => {
        expect(
            timeIntervalToExcelNumFmt(TimeFrames.QUARTER, DimensionType.DATE),
        ).toBeNull();
    });

    it('DAY_OF_WEEK_NAME → null (non-native)', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.DAY_OF_WEEK_NAME,
                DimensionType.DATE,
            ),
        ).toBeNull();
    });

    it('MONTH_NAME → null (non-native)', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.MONTH_NAME,
                DimensionType.DATE,
            ),
        ).toBeNull();
    });

    it('QUARTER_NUM → null (non-native)', () => {
        expect(
            timeIntervalToExcelNumFmt(
                TimeFrames.QUARTER_NUM,
                DimensionType.DATE,
            ),
        ).toBeNull();
    });
});
