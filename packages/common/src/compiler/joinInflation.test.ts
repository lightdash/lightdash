import { CompileError } from '../types/errors';
import { JoinRelationship } from '../types/explore';
import { findTablesWithMetricInflation } from './joinInflation';

describe('findTablesWithMetricInflation', () => {
    it.each([JoinRelationship.ONE_TO_MANY, JoinRelationship.MANY_TO_MANY])(
        'rejects missing joins without cached warnings, even with a %s join',
        (relationship) => {
            const analyze = () =>
                findTablesWithMetricInflation({
                    baseTable: 'orders',
                    joinedTables: new Set(['orders', 'items', 'account']),
                    possibleJoins: [
                        {
                            table: 'items',
                            sqlOn: '',
                            compiledSqlOn: '',
                            relationship,
                            tablesReferences: ['orders', 'items'],
                        },
                    ],
                    tables: {
                        orders: { primaryKey: ['id'] },
                        items: { primaryKey: ['id'] },
                    },
                });

            expect(analyze).toThrow(CompileError);
            expect(analyze).toThrow(
                /Join "account" is not available for base table "orders"/,
            );
            expect(analyze).toThrow(/compilation warnings.*tags\/selector/);
        },
    );
});
