import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FIXED_NUMBER_BIN_WRITE_BACK_ERROR,
    getCustomDimensionWriteBackError,
    type CustomBinDimension,
    type CustomSqlDimension,
} from '@lightdash/common';
import { getCustomDimensionsForWriteBack } from './writeBackSupport';

const makeBin = (binType: BinType): CustomBinDimension => {
    const base = {
        id: 'amount_range',
        name: 'Amount range',
        table: 'orders',
        type: CustomDimensionType.BIN as const,
        dimensionId: 'orders_amount',
    };
    switch (binType) {
        case BinType.FIXED_NUMBER:
            return { ...base, binType, binNumber: 5 };
        case BinType.FIXED_WIDTH:
            return { ...base, binType, binWidth: 10 };
        case BinType.CUSTOM_RANGE:
            return { ...base, binType, customRange: [] };
        case BinType.CUSTOM_GROUP:
            return { ...base, binType, customGroups: [] };
    }
};

describe('custom dimension write-back support', () => {
    it('explains why fixed-number bins are unavailable', () => {
        expect(
            getCustomDimensionWriteBackError(makeBin(BinType.FIXED_NUMBER)),
        ).toBe(FIXED_NUMBER_BIN_WRITE_BACK_ERROR);
    });

    it.each([BinType.FIXED_WIDTH, BinType.CUSTOM_RANGE, BinType.CUSTOM_GROUP])(
        'supports %s bins in node actions',
        (binType) => {
            expect(
                getCustomDimensionWriteBackError(makeBin(binType)),
            ).toBeNull();
        },
    );

    it('only includes custom dimensions when the user can manage custom fields', () => {
        const sqlDimension: CustomSqlDimension = {
            id: 'custom_sql',
            name: 'Custom SQL',
            table: 'orders',
            type: CustomDimensionType.SQL,
            sql: '${orders.amount}',
            dimensionType: DimensionType.NUMBER,
        };
        const binDimension = makeBin(BinType.FIXED_WIDTH);

        expect(
            getCustomDimensionsForWriteBack([sqlDimension, binDimension], true),
        ).toEqual([sqlDimension, binDimension]);
        expect(
            getCustomDimensionsForWriteBack(
                [sqlDimension, binDimension],
                false,
            ),
        ).toEqual([]);
    });
});
