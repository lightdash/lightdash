import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { DeepResearchModeControl } from './DeepResearchModeControl';

const ModeHarness = () => {
    const [mode, setMode] = useState<'ask' | 'deep_research'>('ask');

    return <DeepResearchModeControl mode={mode} onModeChange={setMode} />;
};

describe('DeepResearchModeControl', () => {
    it('toggles Deep Research directly without opening settings', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ModeHarness />);

        const enable = screen.getByRole('button', {
            name: 'Turn on Deep research',
        });
        expect(enable).toHaveAttribute('aria-pressed', 'false');

        await user.click(enable);

        const disable = screen.getByRole('button', {
            name: 'Turn off Deep research',
        });
        expect(disable).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await user.click(disable);
        expect(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders a compact icon toggle without a visible label', () => {
        renderWithProviders(
            <DeepResearchModeControl
                mode="ask"
                onModeChange={() => undefined}
                iconOnly
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Deep research')).not.toBeInTheDocument();
    });

    it('disables Deep research while another run is active', async () => {
        const user = userEvent.setup();
        const disabledReason =
            'Only one Deep research run can be active in a thread at a time.';
        const activeRunProps = {
            disabled: true,
            disabledReason,
        };

        renderWithProviders(
            <DeepResearchModeControl
                mode="ask"
                onModeChange={() => undefined}
                {...activeRunProps}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        ).toBeDisabled();

        const explanationTrigger = screen.getByLabelText(disabledReason);
        await user.hover(explanationTrigger);

        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent(disabledReason);
        expect(within(tooltip).queryByRole('button')).not.toBeInTheDocument();
        expect(within(tooltip).queryByRole('link')).not.toBeInTheDocument();
    });

    it('shows the active-run explanation on keyboard focus', async () => {
        const user = userEvent.setup();
        const disabledReason =
            'Only one Deep research run can be active in a thread at a time.';

        renderWithProviders(
            <DeepResearchModeControl
                mode="ask"
                onModeChange={() => undefined}
                disabled
                disabledReason={disabledReason}
                iconOnly
            />,
        );

        await user.tab();

        expect(screen.getByLabelText(disabledReason)).toHaveFocus();
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            disabledReason,
        );
    });
});
