import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { McpInstallationCard } from './McpInstallationCard';

const siteUrl = 'https://lightdash.example.com/analytics///';
const mcpUrl = 'https://lightdash.example.com/analytics/api/v1/mcp';

const renderInstallation = async () => {
    renderWithProviders(<McpInstallationCard />, {
        health: { siteUrl },
    });

    await waitFor(() => {
        expect(screen.getByRole('tabpanel')).toHaveTextContent(mcpUrl);
    });
};

describe('McpInstallationCard', () => {
    it('copies a Claude Code command for the configured deployment URL', async () => {
        const user = userEvent.setup();
        const writeText = vi.spyOn(navigator.clipboard, 'writeText');
        await renderInstallation();

        await user.click(screen.getByRole('tab', { name: 'Claude Code' }));
        await user.click(
            screen.getByRole('button', {
                name: 'Copy Claude Code configuration',
            }),
        );

        expect(writeText).toHaveBeenCalledExactlyOnceWith(
            `claude mcp add --transport http lightdash '${mcpUrl}'`,
        );
        expect(screen.getByRole('tabpanel')).toHaveTextContent('/mcp');
        expect(screen.getByRole('tabpanel')).toHaveTextContent(
            /sign in to Lightdash.*approve access/i,
        );
    });

    it.each([
        {
            client: 'Cursor',
            configuration: {
                mcpServers: { lightdash: { url: mcpUrl } },
            },
        },
        {
            client: 'VS Code',
            configuration: {
                servers: { lightdash: { type: 'http', url: mcpUrl } },
            },
        },
    ])(
        'switches to the native HTTP configuration for $client',
        async ({ client, configuration }) => {
            const user = userEvent.setup();
            const writeText = vi.spyOn(navigator.clipboard, 'writeText');
            await renderInstallation();

            await user.click(screen.getByRole('tab', { name: client }));
            const panel = screen.getByRole('tabpanel');
            await user.click(
                within(panel).getByRole('button', {
                    name: `Copy ${client} configuration`,
                }),
            );

            expect(writeText).toHaveBeenCalledExactlyOnceWith(
                JSON.stringify(configuration, null, 2),
            );
            expect(panel).toHaveTextContent(/sign in to Lightdash/i);
            expect(panel).not.toHaveTextContent('claude mcp add');
            expect(screen.getByRole('tab', { name: client })).toHaveAttribute(
                'aria-selected',
                'true',
            );
        },
    );

    it('copies both server registration and OAuth sign-in for Codex', async () => {
        const user = userEvent.setup();
        const writeText = vi.spyOn(navigator.clipboard, 'writeText');
        await renderInstallation();

        await user.click(screen.getByRole('tab', { name: 'Codex' }));
        await user.click(
            screen.getByRole('button', { name: 'Copy Codex configuration' }),
        );

        expect(writeText).toHaveBeenCalledExactlyOnceWith(
            `codex mcp add lightdash --url '${mcpUrl}'\ncodex mcp login lightdash`,
        );
        expect(screen.getByRole('tabpanel')).toHaveTextContent(
            /sign in to Lightdash.*approve access/i,
        );
    });

    it('offers remote server instructions without stdio bridges for every client', async () => {
        const user = userEvent.setup();
        await renderInstallation();

        for (const tab of screen.getAllByRole('tab')) {
            await user.click(tab);
            const panel = screen.getByRole('tabpanel');

            expect(panel).toHaveTextContent(mcpUrl);
            expect(panel).not.toHaveTextContent(/stdio|mcp-remote|\bnpx\b/i);
        }
    });
});
