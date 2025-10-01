import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { compileSpreadsheetFormula } from './spreadsheetFormulaCompiler';

describe('compileSpreadsheetFormula', () => {
    test('can compile 1+1', () => {
        expect(
            compileSpreadsheetFormula('1 + 1', warehouseClientMock),
        ).toStrictEqual('1 + 1');
    });
});
