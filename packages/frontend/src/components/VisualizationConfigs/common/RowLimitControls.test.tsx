import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { RowLimitControls } from './RowLimitControls';

describe('RowLimitControls', () => {
    it('toggles the row limit with the keyboard', async () => {
        const user = userEvent.setup();
        const onRowLimitChange = vi.fn();

        renderWithProviders(
            <RowLimitControls
                rowLimit={undefined}
                onRowLimitChange={onRowLimitChange}
            />,
        );

        const toggle = screen.getByRole('switch', {
            name: 'Limit displayed rows',
        });
        toggle.focus();
        await user.keyboard(' ');

        expect(onRowLimitChange).toHaveBeenCalledWith({
            mode: 'show',
            direction: 'first',
            count: 50,
        });
    });
});
