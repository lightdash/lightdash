import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ThreadDivider from './ThreadDivider';

describe('ThreadDivider', () => {
    it('names the version the new thread starts from', () => {
        renderWithProviders(<ThreadDivider fromVersion={4} />);

        expect(
            screen.getByText(/Context cleared, starting fresh from/),
        ).toBeInTheDocument();
        expect(screen.getByText('v4')).toBeInTheDocument();
    });
});
