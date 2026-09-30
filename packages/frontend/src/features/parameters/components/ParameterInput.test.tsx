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
    it.each([false, true])(
        'names the clear control without a caller override (multiple=%s)',
        (multiple) => {
            const { getByRole } = renderWithProviders(
                <ParameterInput
                    paramKey="status"
                    parameter={{
                        label: 'Status',
                        options: ['Cancelled'],
                        multiple,
                    }}
                    value={multiple ? ['Cancelled'] : 'Cancelled'}
                    onParameterChange={vi.fn()}
                />,
            );
            expect(
                getByRole('button', { name: 'Clear parameter: Status' }),
            ).toHaveAttribute('tabindex', '0');
        },
    );
    it('keeps an inherited default out of authored choices and leaves the selection empty', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Channel',
            default: 'all',
            options: ['Cancelled', 'Expired'],
        });
        const input = getByRole('combobox', { name: 'Channel' });
        expect(input).toHaveValue('');
        await userEvent.click(input);
        expect(getOptionLabels(container)).toEqual(['Cancelled', 'Expired']);
    });

    it('shows a zero default as a placeholder, not a selection', () => {
        const { getByRole } = renderParameter({
            label: 'Channel',
            type: 'number',
            default: 0,
        });
        expect(getByRole('combobox', { name: 'Channel' })).toHaveAttribute(
            'placeholder',
            'Default: 0',
        );
        expect(getByRole('combobox', { name: 'Channel' })).toHaveValue('');
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
