import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemePicker } from './ThemePicker';

vi.mock('../hooks/useOrganizationDesigns', () => ({
    useOrganizationDesigns: () => ({ data: [] }),
}));

const renderPicker = (
    props: Partial<React.ComponentProps<typeof ThemePicker>> = {},
) =>
    render(
        <MemoryRouter>
            <MantineProvider>
                <ThemePicker value={null} onChange={vi.fn()} {...props} />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('ThemePicker compact', () => {
    it('renders the no-theme label as a single-line pill trigger', () => {
        renderPicker({ compact: true });
        const trigger = screen.getByRole('button', {
            name: /Theme: No theme/i,
        });
        expect(trigger).toBeInTheDocument();
        // Description line is suppressed in compact mode.
        expect(
            screen.queryByText(
                'No shared design assets - prompt any style you want',
            ),
        ).not.toBeInTheDocument();
    });
});
