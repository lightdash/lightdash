import {
    buildUserContent,
    type FormulaTableCalculationContext,
} from './formulaTableCalculationGenerator';

const FIELD_GUIDE = 'METRICS:\n  orders_revenue - "Revenue" (number)';

const baseContext = {
    tableName: 'Orders',
    fieldsContext: [],
    existingTableCalculations: [],
};

describe('buildUserContent', () => {
    describe('prompt mode', () => {
        it('frames the request around the natural-language prompt', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'prompt',
                prompt: 'average revenue rounded to 2 decimals',
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).toContain(
                'Create a formula table calculation based on this request',
            );
            expect(content).toContain('average revenue rounded to 2 decimals');
            expect(content).toContain(FIELD_GUIDE);
            expect(content).not.toContain('Source SQL:');
        });

        it('includes currentFormula context when provided', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'prompt',
                prompt: 'round this to 2 decimals',
                currentFormula: 'AVG(orders_revenue)',
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).toContain('Current formula');
            expect(content).toContain('AVG(orders_revenue)');
        });

        it('lists already-taken table calculation names', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'prompt',
                prompt: 'any',
                existingTableCalculations: ['Revenue Growth', 'Order Rate'],
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).toContain(
                'These table calculation names are already taken: Revenue Growth, Order Rate',
            );
        });
    });

    describe('convert-sql mode', () => {
        it('asks the model to convert the SQL and includes the source verbatim', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'convert-sql',
                sourceSql: 'ROUND(AVG("orders_revenue"), 2)',
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).toContain(
                'Convert the following SQL expression into an equivalent formula expression',
            );
            expect(content).toContain('Source SQL:');
            expect(content).toContain('ROUND(AVG("orders_revenue"), 2)');
            expect(content).toContain(FIELD_GUIDE);
        });

        it('does not add prompt-mode framing', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'convert-sql',
                sourceSql: 'SUM(revenue)',
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).not.toContain(
                'Create a formula table calculation based on this request',
            );
            expect(content).not.toContain('Current formula');
        });

        it('lists already-taken table calculation names', () => {
            const context: FormulaTableCalculationContext = {
                ...baseContext,
                mode: 'convert-sql',
                sourceSql: 'SUM(revenue)',
                existingTableCalculations: ['Total Revenue'],
            };

            const content = buildUserContent(context, FIELD_GUIDE);

            expect(content).toContain(
                'These table calculation names are already taken: Total Revenue',
            );
        });
    });
});
