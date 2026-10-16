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

describe('hostile connection names in dialect guidance', () => {
    it.each(Object.values(WarehouseTypes))(
        'serializes a %s connection name as one JSON string',
        (warehouseType) => {
            const name = 'name"`;--\n/* comment */<script>alert(1)</script>';
            const prompt = getRunSqlSection({
                warehouseType: WarehouseTypes.POSTGRES,
                warehouseSchema: 'public',
                warehouseConnections: [
                    {
                        name: 'Original',
                        warehouseType: WarehouseTypes.POSTGRES,
                        warehouseConnectionUuid: null,
                        isOriginal: true,
                    },
                    {
                        name,
                        warehouseType,
                        warehouseConnectionUuid: 'extra',
                        isOriginal: false,
                    },
                ],
            });
            expect(prompt).toContain(
                `- ${JSON.stringify(name)} (extra): ${warehouseType}.`,
            );
            expect(prompt).not.toContain(name);
            expect(
                prompt.split('\n').filter((line) => line.startsWith('- "name')),
            ).toHaveLength(1);
        },
    );
});
