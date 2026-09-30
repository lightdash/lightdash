import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ParameterDateInput from './ParameterDateInput';

describe('ParameterDateInput', () => {
    it('shows the inherited date as a hint without selecting it', () => {
        const { getByRole, container } = renderWithProviders(
            <ParameterDateInput
                paramKey="start_date"
                parameter={{
                    type: 'date',
                    label: 'Start date',
                    default: '2026-09-30',
                }}
                currentValue={null}
                onParameterChange={vi.fn()}
            />,
        );
        expect(getByRole('button', { name: 'Start date' })).toHaveTextContent(
            'Default: 2026-09-30',
        );
        expect(container.querySelector('input[type="hidden"]')).toHaveValue('');
    });

    it('clears an explicit date without selecting the inherited default', async () => {
        const onChange = vi.fn();
        const Picker = () => {
            const [value, setValue] = useState<string | null>('2026-09-29');
            return (
                <ParameterDateInput
                    paramKey="start_date"
                    parameter={{
                        type: 'date',
                        label: 'Start date',
                        default: '2026-09-30',
                    }}
                    currentValue={value}
                    onParameterChange={(key, next) => {
                        onChange(key, next);
                        setValue(next as string | null);
                    }}
                />
            );
        };
        const { getByRole, container } = renderWithProviders(<Picker />);
        await userEvent.click(
            getByRole('button', { name: 'Clear parameter: Start date' }),
        );
        expect(onChange).toHaveBeenCalledWith('start_date', null);
        expect(container.querySelector('input[type="hidden"]')).toHaveValue('');
        expect(getByRole('button', { name: 'Start date' })).toHaveTextContent(
            'Default: 2026-09-30',
        );
    });

    it('uses supplied UI strings for the default and clear labels', () => {
        const { getByRole } = renderWithProviders(
            <ParameterDateInput
                paramKey="start_date"
                parameter={{
                    type: 'date',
                    label: 'Start date',
                    default: '2026-09-30',
                }}
                currentValue={null}
                onParameterChange={vi.fn()}
                getUiString={(key) =>
                    key === 'parameters.defaultValue' ? 'Defecto: {value}' : key
                }
            />,
        );
        expect(getByRole('button', { name: 'Start date' })).toHaveTextContent(
            'Defecto: 2026-09-30',
        );
    });
});
