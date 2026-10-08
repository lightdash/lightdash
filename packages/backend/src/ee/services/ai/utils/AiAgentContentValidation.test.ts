import { ParameterError } from '@lightdash/common';
import { AiAgentContentValidation } from './AiAgentContentValidation';

const sqlChart = {
    name: 'Orders by status',
    description: null,
    slug: 'orders-by-status',
    spaceSlug: 'sales',
    contentType: 'sql_chart',
    sql: 'select status, count(*) as orders from orders group by 1',
    limit: 500,
    chartKind: 'table',
    version: 1,
    config: {
        metadata: { version: 1 },
        type: 'table',
        columns: {},
        display: {},
    },
};

const getValidationErrors = (run: () => void): string[] => {
    try {
        run();
    } catch (error) {
        if (error instanceof ParameterError) {
            return (error.data as { validationErrors: string[] })
                .validationErrors;
        }
        throw error;
    }
    return [];
};

describe('AiAgentContentValidation', () => {
    const validation = new AiAgentContentValidation();

    it('accepts a SQL chart', () => {
        expect(
            getValidationErrors(() =>
                validation.validateNewContent('sql_chart', sqlChart),
            ),
        ).toEqual([]);
    });

    it('reports only the missing field for a SQL chart without sql', () => {
        const { sql, ...withoutSql } = sqlChart;
        expect(
            getValidationErrors(() =>
                validation.validateNewContent('sql_chart', withoutSql),
            ),
        ).toEqual(['/ is missing required property "sql"']);
    });

    it('rejects semantic layer chart fields on a SQL chart', () => {
        expect(
            getValidationErrors(() =>
                validation.validateContent('sql_chart', {
                    ...sqlChart,
                    tableName: 'orders',
                }),
            ),
        ).toEqual(['/ has unexpected property "tableName"']);
    });
});
