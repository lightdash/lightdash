import {
    WarehouseTypes,
    buildPostgresAiServiceAccountCommands,
    type PostgresCredentials,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { PostgresAgentSetup } from './PostgresAgentSetup';

const connection: PostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    port: 5432,
    dbname: 'analytics"database',
    schema: 'reporting"schema',
};

describe('Postgres agent setup', () => {
    it('shows three steps, login prerequisites and row and column policy limits', () => {
        renderWithProviders(
            <PostgresAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        for (const title of [
            'Create the account in Postgres',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(screen.getByText(/Run as a superuser/)).toHaveTextContent(
            'CREATEROLE',
        );
        expect(
            screen.getByText(/Row-level security does not apply/),
        ).toHaveTextContent('BYPASSRLS');
        expect(
            screen.getByText(/Row-level security does not apply/),
        ).toHaveTextContent('FORCE ROW LEVEL SECURITY');
        expect(screen.getByText(/To hide sensitive columns/)).toHaveTextContent(
            'table-wide grant still allows every column',
        );
        expect(
            screen.getByText(/Run ALTER DEFAULT PRIVILEGES/),
        ).toHaveTextContent('each role that creates tables');
        expect(screen.getByText(/Enter the ai_agents user/)).toHaveTextContent(
            'password',
        );
    });
    it('copies all three escaped SQL snippets', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <PostgresAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        const buttons = screen.getAllByRole('button', { name: 'Copy SQL' });
        const commands = buildPostgresAiServiceAccountCommands(connection);
        const snippets = [
            commands.createRole,
            commands.grantReadAccess,
            commands.rowLevelSecurity,
        ];
        expect(buttons).toHaveLength(3);
        for (const [index, button] of buttons.entries()) {
            fireEvent.click(button);
            await waitFor(() =>
                expect(writeText).toHaveBeenLastCalledWith(snippets[index]),
            );
        }
    });
    it('uses placeholders when connection settings are empty', () => {
        renderWithProviders(
            <PostgresAgentSetup
                connection={{ ...connection, dbname: '', schema: '' }}
                hasCredentials={false}
                tested={false}
            />,
        );
        expect(screen.getByRole('region')).toHaveTextContent(
            '"<schema>"."<table>"',
        );
        expect(screen.getByRole('region')).toHaveTextContent('"<database>"');
    });
    it('collapses saved setup and marks only the tested step complete', async () => {
        renderWithProviders(
            <PostgresAgentSetup
                connection={connection}
                hasCredentials
                tested
            />,
        );
        const button = screen.getByRole('button', {
            name: 'How to set up the shared agent account',
        });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        await waitFor(() =>
            expect(screen.getByLabelText('Step 3 done')).toBeVisible(),
        );
    });
});
