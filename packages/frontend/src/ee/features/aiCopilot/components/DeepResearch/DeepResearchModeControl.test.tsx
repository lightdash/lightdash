import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type DeepResearchDepth } from '../../deepResearch/types';
import { DeepResearchModeControl } from './DeepResearchModeControl';
import { DeepResearchPreflight } from './DeepResearchPreflight';

const ModeHarness = () => {
    const [mode, setMode] = useState<'ask' | 'deep_research'>('ask');
    const [depth, setDepth] = useState<DeepResearchDepth>('standard');

    return (
        <>
            <DeepResearchModeControl mode={mode} onModeChange={setMode} />
            {mode === 'deep_research' && (
                <DeepResearchPreflight
                    depth={depth}
                    onDepthChange={setDepth}
                    mcpServers={[]}
                    selectedMcpServerUuids={[]}
                    onSelectedMcpServerUuidsChange={() => undefined}
                    isLoadingMcpServers={false}
                    mcpServerError={null}
                />
            )}
        </>
    );
};

describe('DeepResearchModeControl', () => {
    it('keeps Ask as the unchanged default mode', () => {
        renderWithProviders(<ModeHarness />);

        expect(
            screen.getByRole('button', { name: 'Deep research' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            screen.queryByRole('region', {
                name: 'Deep research settings',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows inline research settings and toggles back to Ask', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ModeHarness />);

        const modeButton = screen.getByRole('button', {
            name: 'Deep research',
        });
        await user.click(modeButton);

        expect(modeButton).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('region', { name: 'Deep research settings' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.getByText('Agent context and project data'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('This agent has no MCP servers attached.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Start research' }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByText('Low'));
        expect(screen.queryByText(/Up to \d+ minutes/)).not.toBeInTheDocument();
        expect(screen.getByText('Up to 10 queries')).toBeInTheDocument();

        await user.click(modeButton);
        expect(
            screen.queryByRole('region', {
                name: 'Deep research settings',
            }),
        ).not.toBeInTheDocument();
    });
});
