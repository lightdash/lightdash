import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../testing/testUtils';
import { SampleProjectConnectionNotice } from './SampleProjectConnectionNotice';

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const setNewOnboarding = (enabled: boolean) =>
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { enabled },
    } as ReturnType<typeof useServerFeatureFlag>);

const renderNotice = () =>
    renderWithProviders(
        <MemoryRouter>
            <SampleProjectConnectionNotice />
        </MemoryRouter>,
    );

describe('SampleProjectConnectionNotice', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReset();
    });

    it('links to the connect your data flow', () => {
        setNewOnboarding(true);
        renderNotice();

        expect(
            screen.getByText('This project uses sample data'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Connect your data' }),
        ).toHaveAttribute('href', '/onboarding/data-source');
    });

    it('links to project creation without the new onboarding', () => {
        setNewOnboarding(false);
        renderNotice();

        expect(
            screen.getByRole('link', { name: 'Connect your data' }),
        ).toHaveAttribute('href', '/createProject');
    });
});
