import { buildSystemPrompt } from './formulaTableCalculationGenerator';

describe('buildSystemPrompt', () => {
    it('explains that moving-window arguments count preceding rows, not total rows', () => {
        const prompt = buildSystemPrompt();

        expect(prompt).toContain(
            'For MOVING_SUM and MOVING_AVG, the second argument is the number of preceding rows; the current row is also included.',
        );
        expect(prompt).toContain(
            'For "trailing N", "rolling N", or "N-period moving" sums/averages, use MOVING_SUM/MOVING_AVG with N - 1 as the second argument because SQL window frames include the current row.',
        );
        expect(prompt).toContain(
            'MOVING_AVG(orders_total_revenue, 2, PARTITION BY orders_partner_name, ORDER BY orders_order_month)',
        );
    });
});
