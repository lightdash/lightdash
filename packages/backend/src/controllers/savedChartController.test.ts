import { ForbiddenError } from '@lightdash/common';
import express from 'express';
import { SavedChartController } from './savedChartController';

describe('SavedChartController.calculateTotalFromSavedChart', () => {
    const calculateTotal = (account: unknown) => {
        const calculateTotalFromSavedChart = vi.fn().mockResolvedValue({});
        const controller = new SavedChartController({
            getAsyncQueryService: () => ({ calculateTotalFromSavedChart }),
        } as unknown as ConstructorParameters<typeof SavedChartController>[0]);
        controller.setStatus = vi.fn();
        return {
            calculateTotalFromSavedChart,
            response: controller.calculateTotalFromSavedChart(
                'chart-uuid',
                { parameters: { region: 'APAC' } },
                { account } as unknown as express.Request,
            ),
        };
    };

    // Embeds calculate totals through their own routes, which apply the token's rules
    it('refuses an embed token', async () => {
        const { calculateTotalFromSavedChart, response } = calculateTotal({
            user: { type: 'anonymous' },
        });
        await expect(response).rejects.toThrow(ForbiddenError);
        expect(calculateTotalFromSavedChart).not.toHaveBeenCalled();
    });

    it('calculates the total for a signed-in user', async () => {
        const account = { user: { type: 'registered' } };
        const { calculateTotalFromSavedChart, response } =
            calculateTotal(account);
        await response;
        expect(calculateTotalFromSavedChart).toHaveBeenCalledWith(
            account,
            'chart-uuid',
            undefined,
            undefined,
            { region: 'APAC' },
        );
    });
});
