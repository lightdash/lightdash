import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MantineModal from '.';
import { renderWithProviders } from '../../../testing/testUtils';

describe('MantineModal', () => {
    it('uses its title as the accessible dialog name', () => {
        renderWithProviders(
            <MantineModal opened onClose={vi.fn()} title="Named modal">
                Modal content
            </MantineModal>,
        );

        expect(
            screen.getByRole('dialog', { name: 'Named modal' }),
        ).toBeInTheDocument();
    });
});
