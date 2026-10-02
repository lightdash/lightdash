import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { SignInExpiredState } from './SignInExpiredState';

describe('SignInExpiredState', () => {
    it('folds the error under details', () => {
        renderWithProviders(<SignInExpiredState details="Provider detail" />);
        expect(screen.getByText('Sign-in expired')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Show details' }),
        ).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
        expect(
            screen.getByRole('button', { name: 'Hide details' }),
        ).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Provider detail')).toBeInTheDocument();
    });
});
