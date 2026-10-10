import {
    WarehouseTypes,
    buildClickhouseAiServiceAccountCommands,
    type ClickhouseCredentials,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ClickhouseAgentSetup } from './ClickhouseAgentSetup';

const connection: ClickhouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE,
    host: 'warehouse.internal',
    port: 8123,
    secure: false,
    schema: 'reporting`database',
};

describe('ClickHouse agent setup', () => {
    it('shows three steps, read-only guidance and row policy limits', () => {
        renderWithProviders(
            <ClickhouseAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        for (const title of [
            'Create the account in ClickHouse',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(
            screen.getByText(/Run as a user with CREATE USER/),
        ).toHaveTextContent(
            'readonly = 2 keeps queries read-only and allows the query settings agents need.',
        );
        expect(
            screen.getByText(/Grant SELECT on the project database/),
        ).toHaveTextContent(
            "The row policy is a template. Replace the table and condition before you run it. Everyone's agent shares this account's access.",
        );
        expect(screen.getByText(/Enter the ai_agents user/)).toHaveTextContent(
            'then select Test and save.',
        );
    });
    it('copies all three escaped SQL snippets', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <ClickhouseAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        const buttons = screen.getAllByRole('button', { name: 'Copy SQL' });
        const commands = buildClickhouseAiServiceAccountCommands(connection);
        expect(commands.grantReadAccess).toContain('`reporting\\`database`');
        const snippets = [
            commands.createUser,
            commands.grantReadAccess,
            commands.rowPolicy,
        ];
        expect(buttons).toHaveLength(3);
        for (const snippet of snippets) {
            expect(snippet).toContain('\n');
            expect(snippet.split('\n').every((line) => line.length < 80)).toBe(
                true,
            );
        }
        for (const [index, button] of buttons.entries()) {
            fireEvent.click(button);
            await waitFor(() =>
                expect(writeText).toHaveBeenLastCalledWith(snippets[index]),
            );
        }
    });
    it('uses placeholders when connection settings are empty', () => {
        renderWithProviders(
            <ClickhouseAgentSetup
                connection={{ ...connection, schema: '' }}
                hasCredentials={false}
                tested={false}
            />,
        );
        expect(screen.getByRole('region')).toHaveTextContent(
            '`<database>`.`<table>`',
        );
    });
    it('collapses saved setup and marks only the tested step complete', async () => {
        renderWithProviders(
            <ClickhouseAgentSetup
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
        expect(screen.queryByLabelText('Step 1 done')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Step 2 done')).not.toBeInTheDocument();
    });
});
