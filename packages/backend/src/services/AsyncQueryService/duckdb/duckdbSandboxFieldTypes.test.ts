import {
    DuckDBDecimalType,
    DuckDBTypeId,
    type DuckDBType,
} from '@duckdb/node-api';
import {
    getNumericKindFromType,
    mapFieldTypeFromTypeId,
} from '@lightdash/warehouses';
import { getDuckdbSandboxField } from './duckdbSandboxFieldTypes';

/** Python `DuckDBPyType.id` names and the node-api type each one is. */
const PYTHON_TYPE_IDS: [string, DuckDBTypeId][] = [
    ['boolean', DuckDBTypeId.BOOLEAN],
    ['tinyint', DuckDBTypeId.TINYINT],
    ['smallint', DuckDBTypeId.SMALLINT],
    ['integer', DuckDBTypeId.INTEGER],
    ['bigint', DuckDBTypeId.BIGINT],
    ['hugeint', DuckDBTypeId.HUGEINT],
    ['utinyint', DuckDBTypeId.UTINYINT],
    ['usmallint', DuckDBTypeId.USMALLINT],
    ['uinteger', DuckDBTypeId.UINTEGER],
    ['ubigint', DuckDBTypeId.UBIGINT],
    ['uhugeint', DuckDBTypeId.UHUGEINT],
    ['float', DuckDBTypeId.FLOAT],
    ['double', DuckDBTypeId.DOUBLE],
    ['varchar', DuckDBTypeId.VARCHAR],
    ['blob', DuckDBTypeId.BLOB],
    ['date', DuckDBTypeId.DATE],
    ['time', DuckDBTypeId.TIME],
    ['time with time zone', DuckDBTypeId.TIME_TZ],
    ['time_ns', DuckDBTypeId.TIME_NS],
    ['timestamp', DuckDBTypeId.TIMESTAMP],
    ['timestamp_s', DuckDBTypeId.TIMESTAMP_S],
    ['timestamp_ms', DuckDBTypeId.TIMESTAMP_MS],
    ['timestamp_ns', DuckDBTypeId.TIMESTAMP_NS],
    ['timestamp with time zone', DuckDBTypeId.TIMESTAMP_TZ],
    ['interval', DuckDBTypeId.INTERVAL],
    ['uuid', DuckDBTypeId.UUID],
    ['list', DuckDBTypeId.LIST],
    ['array', DuckDBTypeId.ARRAY],
    ['struct', DuckDBTypeId.STRUCT],
    ['map', DuckDBTypeId.MAP],
    ['union', DuckDBTypeId.UNION],
    ['enum', DuckDBTypeId.ENUM],
    ['bit', DuckDBTypeId.BIT],
    ['bignum', DuckDBTypeId.BIGNUM],
];

const nodeField = (type: DuckDBType) => {
    const numericKind = getNumericKindFromType(type);
    return {
        type: mapFieldTypeFromTypeId(type.typeId),
        ...(numericKind ? { numericKind } : {}),
    };
};

describe('getDuckdbSandboxField', () => {
    it.each(PYTHON_TYPE_IDS)(
        'maps %s to the field the server client reports',
        (pythonTypeId, typeId) => {
            expect(getDuckdbSandboxField(pythonTypeId, null)).toEqual(
                nodeField({ typeId } as DuckDBType),
            );
        },
    );

    it.each([
        [10, 2],
        [38, 0],
        [18, 9],
    ])('keeps the scale of DECIMAL(%i,%i)', (width, scale) => {
        expect(getDuckdbSandboxField('decimal', scale)).toEqual(
            nodeField(new DuckDBDecimalType(width, scale)),
        );
    });

    it('reports an unknown type as a string', () => {
        expect(getDuckdbSandboxField('some_future_type', null)).toEqual({
            type: 'string',
        });
    });
});
