import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { SqlRunToolCallDescription } from './SqlRunToolCallDescription';

describe('SqlRunToolCallDescription', () => {
    it('expands completed SQL into a modal without approval actions', async () => {
        renderWithProviders(
            <SqlRunToolCallDescription sql="select 1" limit={500} />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Expand SQL' }),
        );
        const dialog = await screen.findByRole('dialog');

        expect(within(dialog).getByText('Row limit: 500')).toBeInTheDocument();
        expect(
            within(dialog).queryByRole('button', { name: 'Approve' }),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).getByRole('button', { name: 'Copy' }),
        ).toBeInTheDocument();
    });
});
