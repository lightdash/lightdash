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
    it('collapses to an "Apply theme" call to action when none is selected', () => {
        renderPicker({ compact: true });
        const trigger = screen.getByRole('button', {
            name: /Apply theme/i,
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
