import { type LightdashProjectParameter } from '@lightdash/common';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ParameterInput } from './ParameterInput';

const renderParameter = (parameter: LightdashProjectParameter) =>
    renderWithProviders(
        <ParameterInput
            paramKey="channel"
            parameter={parameter}
            value={null}
            onParameterChange={vi.fn()}
        />,
    );

const getOptionLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[role="option"]')).map(
        (option) => option.textContent,
    );

describe('ParameterInput', () => {
    it.each([
        { type: 'string' as const, default: 'all', value: 'Cancelled' },
        { type: 'number' as const, default: 0, value: 10 },
    ])(
        'selects a missing $type default as an explicit value',
        async (parameter) => {
            const onParameterChange = vi.fn();
            const { getByRole } = renderWithProviders(
                <ParameterInput
                    paramKey="status"
                    parameter={{
                        ...parameter,
                        label: 'Status',
                        options: [String(parameter.value)],
                    }}
                    value={parameter.value}
                    onParameterChange={onParameterChange}
                />,
            );
            await userEvent.click(getByRole('combobox'));
            await userEvent.click(
                getByRole('option', { name: `${parameter.default} (default)` }),
            );
            expect(onParameterChange).toHaveBeenCalledWith(
                'status',
                parameter.default,
            );
        },
    );

    it('does not duplicate an existing labelled default option', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Status',
            default: 'all',
            options: [
                { label: 'All statuses', value: 'all' },
                { label: 'Cancelled', value: 'Cancelled' },
            ],
        });
        await userEvent.click(getByRole('combobox'));
        expect(getOptionLabels(container)).toEqual([
            'All statuses',
            'Cancelled',
        ]);
    });

    it('includes missing multi-value defaults once', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Status',
            multiple: true,
            default: ['all', 'all', 'Cancelled'],
            options: ['Cancelled'],
        });
        await userEvent.click(getByRole('combobox'));
        expect(getOptionLabels(container)).toEqual([
            'Cancelled',
            'all (default)',
        ]);
    });

    it.each([false, true])(
        'shows the scrollbar without hovering or scrolling (multiple=%s)',
        async (multiple) => {
            const { container, getByRole } = renderParameter({
                label: 'Channel',
                multiple,
                options: Array.from(
                    { length: 30 },
                    (_, index) => `Option ${index}`,
                ),
            });

            await userEvent.click(getByRole('combobox'));

            const scrollbar = container.querySelector(
                '.mantine-ScrollArea-scrollbar[data-orientation="vertical"]',
            );
            expect(scrollbar).toBeInTheDocument();
            expect(scrollbar).not.toHaveAttribute('data-state', 'hidden');
        },
    );

    it('renders plain options in the order they were authored', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Channel',
            options: ['Global', 'sub_channel', 'Alpha'],
        });

        await userEvent.click(getByRole('combobox'));

        expect(getOptionLabels(container)).toEqual([
            'Global',
            'sub_channel',
            'Alpha',
        ]);
    });

    it('renders labelled options in the order they were authored', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Channel',
            options: [
                { label: 'Zebra', value: 'z' },
                { label: 'Apple', value: 'a' },
            ],
        });

        await userEvent.click(getByRole('combobox'));

        expect(getOptionLabels(container)).toEqual(['Zebra', 'Apple']);
    });
});
