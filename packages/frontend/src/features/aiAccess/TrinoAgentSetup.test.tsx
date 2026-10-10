import {
    WarehouseTypes,
    buildTrinoAiServiceAccountCommands,
    type TrinoCredentials,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { TrinoAgentSetup } from './TrinoAgentSetup';

const connection: TrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'warehouse.internal',
    port: 8443,
    http_scheme: 'https',
    dbname: 'analytics"database',
    schema: 'reporting"schema',
};

describe('Trino agent setup', () => {
    it('shows three steps, login prerequisites and row and column policy limits', () => {
        renderWithProviders(
            <TrinoAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        for (const title of [
            'Create or choose the Trino login',
            'Limit what the login can read',
            'Enter the user and password',
            'File-based access control (rules.json)',
            'SQL roles and grants',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(screen.getByText(/Trino has no CREATE USER/)).toHaveTextContent(
            'password authentication over HTTPS',
        );
        expect(screen.getByText(/On Starburst Galaxy/)).toHaveTextContent(
            'basic authentication',
        );
        expect(
            screen.getByText(/Set access-control.name=file/),
        ).toHaveTextContent('first match wins');
        expect(screen.getByText(/Replace the user, table/)).toHaveTextContent(
            'optional',
        );
        expect(screen.getByText(/Use this alternative only/)).toHaveTextContent(
            'IN "<catalog>"',
        );
        expect(screen.getByText(/Everyone using agents/)).toHaveTextContent(
            'Test checks the sign-in, not every grant',
        );
    });
    it('copies both access control alternatives', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <TrinoAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        const buttons = [
            screen.getByRole('button', { name: 'Copy rules.json' }),
            screen.getByRole('button', { name: 'Copy SQL' }),
        ];
        const commands = buildTrinoAiServiceAccountCommands(connection);
        const snippets = [
            commands.accessControlRules,
            commands.grantReadAccess,
        ];
        expect(buttons).toHaveLength(2);
        for (const [index, button] of buttons.entries()) {
            fireEvent.click(button);
            await waitFor(() =>
                expect(writeText).toHaveBeenLastCalledWith(snippets[index]),
            );
        }
    });
    it('uses placeholders when connection settings are empty', () => {
        renderWithProviders(
            <TrinoAgentSetup
                connection={{ ...connection, dbname: '', schema: '' }}
                hasCredentials={false}
                tested={false}
            />,
        );
        expect(screen.getByRole('region')).toHaveTextContent(
            '"<schema>"."<table>"',
        );
    });
    it('collapses saved setup and marks only the tested step complete', async () => {
        renderWithProviders(
            <TrinoAgentSetup connection={connection} hasCredentials tested />,
        );
        const button = screen.getByRole('button', {
            name: 'How to set up the AI service account',
        });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        await waitFor(() =>
            expect(screen.getByLabelText('Step 3 done')).toBeVisible(),
        );
    });
});
