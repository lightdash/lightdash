import {
    WarehouseTypes,
    buildRedshiftAiServiceAccountCommands,
    type RedshiftCredentials,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { RedshiftAgentSetup } from './RedshiftAgentSetup';

const connection: RedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'warehouse.internal',
    port: 5432,
    dbname: 'analytics"database',
    schema: 'reporting"schema',
};

describe('Redshift agent setup', () => {
    it('shows three steps, login prerequisites and row and column policy limits', () => {
        renderWithProviders(
            <RedshiftAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        for (const title of [
            'Create the account in Redshift',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(
            screen.getByText(
                'Run as a superuser or a user with CREATE USER. Use an 8 to 64 character password with uppercase, lowercase and a number. Use ASCII characters. Exclude spaces, quotes, backslashes, slashes and @.',
            ),
        ).toBeVisible();
        expect(
            screen.getByText(
                'Run in the project database. Replace placeholders. Repeat ALTER DEFAULT PRIVILEGES for each table owner. It grants access to future tables.',
            ),
        ).toBeVisible();
        expect(
            screen.getByText(
                'These RLS and masking policies are templates. Replace the table, column, type and condition. Match the mask types to the column.',
            ),
        ).toBeVisible();
        expect(
            screen.getByText(
                "Do not give ai_agents superuser, IGNORE RLS or sys:secadmin rights. Check inherited and PUBLIC grants. Everyone shares this account's access. Check policy settings and limits for external and shared tables.",
            ),
        ).toBeVisible();
        expect(screen.getByText(/Enter the ai_agents user/)).toHaveTextContent(
            'password',
        );
    });
    it('copies all four escaped SQL snippets', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <RedshiftAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        const buttons = screen.getAllByRole('button', { name: 'Copy SQL' });
        const commands = buildRedshiftAiServiceAccountCommands(connection);
        const snippets = [
            commands.createUser,
            commands.grantReadAccess,
            commands.rowLevelSecurity,
            commands.masking,
        ];
        expect(buttons).toHaveLength(4);
        for (const [index, button] of buttons.entries()) {
            fireEvent.click(button);
            await waitFor(() =>
                expect(writeText).toHaveBeenLastCalledWith(snippets[index]),
            );
        }
    });
    it('uses placeholders when connection settings are empty', () => {
        renderWithProviders(
            <RedshiftAgentSetup
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
            <RedshiftAgentSetup
                connection={connection}
                hasCredentials
                tested
            />,
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
