import { type DataAppVizField } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizFieldGuidance, {
    DataAppVizFieldHelp,
} from './DataAppVizFieldGuidance';

const field: DataAppVizField = {
    name: 'category',
    label: 'Category',
    type: 'dimension',
    required: true,
};

describe('DataAppVizFieldGuidance', () => {
    it('shows help on hover and dismisses it when the pointer leaves', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DataAppVizFieldHelp
                field={{ ...field, description: 'Choose a category.' }}
            />,
        );
        const icon = screen.getByRole('img', { name: 'About Category' });
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        await user.hover(icon);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Choose a category.',
        );
        await user.unhover(icon);
        await waitFor(() =>
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
        );
    });
    it('keeps descriptions off the form while preserving the accessible description', () => {
        renderWithProviders(
            <>
                <DataAppVizFieldGuidance
                    id="help"
                    field={{
                        ...field,
                        description: 'Groups rows into separate bars.',
                    }}
                />
                <input aria-label="Category" aria-describedby="help" />
            </>,
        );
        expect(
            screen.getByText('Groups rows into separate bars.'),
        ).not.toBeVisible();
        expect(
            screen.getByRole('textbox', { name: 'Category' }),
        ).toHaveAccessibleDescription('Groups rows into separate bars.');
    });

    it.each([undefined, null, '', '   '])(
        'renders no help for absent or blank descriptions (%j)',
        (description) => {
            const fieldWithoutHelp = {
                ...field,
                description,
            } as DataAppVizField;
            const { container } = renderWithProviders(
                <>
                    <DataAppVizFieldHelp field={fieldWithoutHelp} />
                    <DataAppVizFieldGuidance
                        id="help"
                        field={fieldWithoutHelp}
                    />
                </>,
            );
            expect(
                screen.queryByRole('img', { name: 'About Category' }),
            ).not.toBeInTheDocument();
            expect(container.querySelector('#help')).not.toBeInTheDocument();
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        },
    );

    it('opens full field guidance with the keyboard without business-specific examples', async () => {
        const user = userEvent.setup();
        const description =
            'Groups rows into separate bars.\nChoose a category from your own data.';
        renderWithProviders(
            <DataAppVizFieldHelp
                field={{
                    ...field,
                    description,
                    examples: ['Retail', 0, false, null],
                }}
            />,
        );
        const help = screen.getByRole('img', { name: 'About Category' });
        await user.tab();
        expect(help).toHaveFocus();
        expect(await screen.findByRole('tooltip')).toBeVisible();
        expect(
            screen.getByText(description, {
                exact: false,
                normalizer: (text) => text,
            }),
        ).toBeVisible();
        expect(screen.queryByText(/Examples/)).not.toBeInTheDocument();
        expect(screen.queryByText('Retail')).not.toBeInTheDocument();
        await user.tab();
        await waitFor(() =>
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
        );
    });
});
