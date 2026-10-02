import {
    ThresholdOperator,
    type CreateSchedulerAndTargetsWithoutIds,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeTimerBridge } from '../../../../../testing/fakeTimerBridge';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    DEFAULT_VALUES_ALERT,
    SchedulerFormProvider,
    transformFormValues,
    useSchedulerForm,
} from '../schedulerFormContext';
import { SchedulerAlertSection } from './SchedulerAlertSection';

const alertField: TableCalculation = {
    name: 'alert_value',
    displayName: 'Alert value',
    sql: '0.1',
};

const AlertForm = ({
    onSubmit,
}: {
    onSubmit: (values: CreateSchedulerAndTargetsWithoutIds) => void;
}) => {
    const form = useSchedulerForm({
        initialValues: {
            ...DEFAULT_VALUES_ALERT,
            thresholds: [
                {
                    fieldId: alertField.name,
                    operator: ThresholdOperator.GREATER_THAN,
                    value: 0,
                },
            ],
        },
    });

    return (
        <SchedulerFormProvider form={form}>
            <Box
                component="form"
                onSubmit={form.onSubmit((values) => {
                    onSubmit(transformFormValues(values, 'chart'));
                })}
            >
                <SchedulerAlertSection
                    numericMetrics={{ [alertField.name]: alertField }}
                    isThresholdAlertWithNoFields={false}
                    projectUuid={undefined}
                    itemsMap={{}}
                    loading={false}
                />
                <Button type="submit">Save alert</Button>
            </Box>
        </SchedulerFormProvider>
    );
};

const pauseTyping = () => {
    act(() => {
        vi.advanceTimersByTime(500);
    });
};

describe('SchedulerAlertSection', () => {
    let removeFakeTimerBridge: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        removeFakeTimerBridge = installFakeTimerBridge();
    });

    afterEach(() => {
        removeFakeTimerBridge();
        vi.useRealTimers();
    });

    it.each([
        { input: '0.1', value: 0.1 },
        { input: '0.05', value: 0.05 },
    ])(
        'accepts $input in one pass, even with pauses while typing',
        async ({ input, value }) => {
            const user = userEvent.setup({
                advanceTimers: vi.advanceTimersByTime,
            });
            const onSubmit = vi.fn();
            renderWithProviders(<AlertForm onSubmit={onSubmit} />);

            const threshold = screen.getByLabelText('Threshold');
            await user.clear(threshold);
            pauseTyping();
            await user.type(threshold, '0');
            pauseTyping();
            expect(threshold).toHaveDisplayValue('0');
            await user.type(threshold, '.');
            pauseTyping();
            expect(threshold).toHaveDisplayValue('0.');
            for (const digit of input.slice(2)) {
                await user.type(threshold, digit);
                pauseTyping();
            }
            expect(threshold).toHaveDisplayValue(input);

            await user.click(
                screen.getByRole('button', { name: 'Save alert' }),
            );
            expect(onSubmit.mock.lastCall?.[0].thresholds).toEqual([
                {
                    fieldId: alertField.name,
                    operator: ThresholdOperator.GREATER_THAN,
                    value,
                },
            ]);
        },
    );

    it('submits zero as a numeric threshold and allows clearing it', async () => {
        const user = userEvent.setup({
            advanceTimers: vi.advanceTimersByTime,
        });
        const onSubmit = vi.fn();
        renderWithProviders(<AlertForm onSubmit={onSubmit} />);

        const threshold = screen.getByLabelText('Threshold');
        await user.clear(threshold);
        pauseTyping();
        await user.type(threshold, '0');
        pauseTyping();
        await user.click(screen.getByRole('button', { name: 'Save alert' }));
        expect(threshold).toHaveDisplayValue('0');
        expect(onSubmit.mock.lastCall?.[0].thresholds?.[0]?.value).toBe(0);

        await user.clear(threshold);
        pauseTyping();
        await user.click(screen.getByRole('button', { name: 'Save alert' }));
        expect(threshold).toHaveDisplayValue('');
        expect(onSubmit.mock.lastCall?.[0].thresholds).toEqual([]);
    });
});
