import { DEFAULT_UI_STRINGS } from '@lightdash/common';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Parameter from './Parameter';

describe('Parameter', () => {
    it('uses the supplied UI string between the label and value', () => {
        const { getByRole } = renderWithProviders(
            <Parameter
                paramKey="metric_type"
                parameter={{ label: 'Metric Type', default: 'count' }}
                value="count"
                parameterValues={{}}
                openPopoverId={undefined}
                onPopoverOpen={vi.fn()}
                onPopoverClose={vi.fn()}
                onParameterChange={vi.fn()}
                getUiString={(key) =>
                    key === 'parameters.is' ? 'es' : DEFAULT_UI_STRINGS[key]
                }
            />,
        );

        expect(
            getByRole('button', { name: 'Metric Type es count' }),
        ).toBeInTheDocument();
    });

    it.each([false, true])(
        'clears an explicit selection in edit=%s without nested buttons',
        async (isEditMode) => {
            const onChange = vi.fn();
            const { getByRole, container } = renderPicker({
                isEditMode,
                value: 'Cancelled',
                onParameterChange: onChange,
            });
            await userEvent.click(
                getByRole('button', { name: 'Clear parameter: Status' }),
            );
            expect(onChange).toHaveBeenCalledWith('status', null);
            expect(
                getByRole('button', { name: 'Status Default: all' }),
            ).toBeInTheDocument();
            expect(
                getByRole('button', { name: 'Status Default: all' }),
            ).toHaveFocus();
            expect(container.querySelector('button button')).toBeNull();
            expect(
                container.querySelector(
                    '[aria-label="Clear parameter: Status"]',
                ),
            ).toBeNull();
        },
    );

    it('labels the input and explains the scope without treating a default as selected', async () => {
        const { getByRole, getByText } = renderPicker({
            value: null,
            isDashboard: true,
        });
        await userEvent.click(
            getByRole('button', { name: 'Status Default: all' }),
        );
        expect(getByRole('combobox', { name: 'Status' })).toHaveValue('');
        expect(getByText('Changes only affect your view.')).toBeInTheDocument();
        expect(
            getByText('No selection. Charts use the default.'),
        ).toBeInTheDocument();
    });

    it('explains save scope while editing and supports keyboard clearing', async () => {
        const { getByRole, getByText } = renderPicker({
            value: 'Cancelled',
            isEditMode: true,
            isDashboard: true,
        });
        await userEvent.tab();
        await userEvent.tab();
        expect(
            getByRole('button', { name: 'Clear parameter: Status' }),
        ).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        await userEvent.keyboard('{Enter}');
        expect(
            getByText('Changes are saved when you save the dashboard.'),
        ).toBeInTheDocument();
    });

    it('makes a required empty value actionable', async () => {
        const { getByRole, getByText } = renderPicker({
            value: null,
            parameter: { label: 'Status' },
            isRequired: true,
            isDashboard: true,
        });
        await userEvent.click(
            getByRole('button', { name: 'Status Select a value' }),
        );
        expect(
            getByText('Select a value to run the charts.'),
        ).toBeInTheDocument();
        expect(getByRole('combobox', { name: 'Status' })).toHaveAttribute(
            'aria-invalid',
            'true',
        );
    });

    it('identifies chart inheritance instead of implying any value is selected', () => {
        const { getByRole } = renderPicker({
            value: null,
            parameter: { label: 'Status' },
            isDashboard: true,
        });
        expect(
            getByRole('button', { name: 'Status Chart values' }),
        ).toBeInTheDocument();
    });
});

const renderPicker = (props: Partial<ComponentProps<typeof Parameter>>) => {
    const Picker = () => {
        const [value, setValue] = useState(props.value ?? null);
        const [openPopoverId, setOpenPopoverId] = useState<string>();
        return (
            <Parameter
                paramKey="status"
                parameter={{
                    label: 'Status',
                    default: 'all',
                    options: ['Cancelled', 'Expired'],
                }}
                parameterValues={{}}
                {...props}
                value={value}
                openPopoverId={openPopoverId}
                onPopoverOpen={setOpenPopoverId}
                onPopoverClose={() => setOpenPopoverId(undefined)}
                onParameterChange={(key, next) => {
                    props.onParameterChange?.(key, next);
                    setValue(next);
                }}
            />
        );
    };
    return renderWithProviders(<Picker />);
};
