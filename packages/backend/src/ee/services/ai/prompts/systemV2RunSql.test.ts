import { WarehouseTypes } from '@lightdash/common';
import { getRunSqlSection } from './systemV2RunSql';

describe('run SQL connection dialect guidance', () => {
    it('identifies the original execution dialect and every extra dialect', () => {
        const prompt = getRunSqlSection({
            warehouseType: WarehouseTypes.POSTGRES,
            warehouseSchema: 'public',
            warehouseConnections: [
                {
                    name: 'Primary',
                    warehouseConnectionUuid: null,
                    warehouseType: WarehouseTypes.POSTGRES,
                    isOriginal: true,
                },
                {
                    name: 'Lake',
                    warehouseConnectionUuid: 'trino-extra',
                    warehouseType: WarehouseTypes.TRINO,
                    isOriginal: false,
                },
            ],
        });
        expect(prompt).toContain('**Warehouse:** postgres.');
        expect(prompt).toContain(
            '"Lake" (trino-extra): trino. Trino SQL dialect.',
        );
        expect(prompt).toContain('raw SQL tools cannot target it');
        expect(prompt).toContain(
            'Do not use them to query tables on extra connections or join across connections.',
        );
    });
});
