import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { SampleProjectConnectionNotice } from './SampleProjectConnectionNotice';

describe('SampleProjectConnectionNotice', () => {
    it('links to the connect your data flow', () => {
        renderWithProviders(
            <MemoryRouter>
                <SampleProjectConnectionNotice />
            </MemoryRouter>,
        );

        expect(
            screen.getByText('This project uses sample data'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Connect your data' }),
        ).toHaveAttribute('href', '/onboarding/data-source');
    });
});
