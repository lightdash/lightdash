import { DatePicker } from '@mantine-8/dates';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';

describe('Mantine Dates v8 runtime', () => {
    it('renders with the application v8 provider and emits date strings', () => {
        const onChange = vi.fn();
        const { container, getAllByRole } = renderWithProviders(
            <DatePicker
                date="2025-05-01"
                value="2025-05-14"
                onChange={onChange}
            />,
        );

        expect(container.querySelector('[data-selected]')).toHaveTextContent(
            '14',
        );
        const day15 = getAllByRole('button').find(
            (button) => button.textContent === '15',
        );
        expect(day15).toBeDefined();
        if (!day15) throw new Error('Expected May 15 day control');

        fireEvent.click(day15);
        expect(onChange).toHaveBeenCalledWith('2025-05-15');
    });
});
