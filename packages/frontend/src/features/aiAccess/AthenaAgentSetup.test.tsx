import {
    buildAthenaAiServiceAccountCommands,
    WarehouseTypes,
    type AthenaCredentials,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AthenaAgentSetup } from './AthenaAgentSetup';

const connection: AthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'agent-catalog',
    schema: "reporting'database",
    workGroup: 'human-workgroup',
    s3StagingDir: 's3://human-results/',
};

describe('Athena agent setup', () => {
    it('uses the shared three steps and explains identity, expiry and data grants', () => {
        renderWithProviders(
            <AthenaAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        for (const title of [
            'Create the account in Athena',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(
            screen.getByText(/Create an IAM role for agents/),
        ).toHaveTextContent('its own Athena workgroup and S3 results location');
        expect(
            screen.getByText(/Run as a Lake Formation administrator/),
        ).toHaveTextContent('role ARN, not the session ARN');
        expect(screen.getByText(/To limit rows or columns/)).toHaveTextContent(
            'grant a data filter instead',
        );
        expect(
            screen.getByText(/Test checks the AWS identity/),
        ).toHaveTextContent('Session keys expire');
    });
    it('copies each generated policy and grant with connection routing only', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <AthenaAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        const commands = buildAthenaAiServiceAccountCommands({
            region: 'eu-west-1',
            catalog: 'agent-catalog',
            database: "reporting'database",
        });
        for (const [name, code] of [
            ['Copy role trust policy', commands.roleTrustPolicy],
            ['Copy permission policy', commands.permissionPolicy],
            ['Copy Lake Formation grant', commands.lakeFormationGrants],
            ['Copy filtered table grant', commands.filteredTableGrant],
        ]) {
            fireEvent.click(screen.getByRole('button', { name }));
            await waitFor(() =>
                expect(writeText).toHaveBeenLastCalledWith(code),
            );
        }
        expect(writeText).toHaveBeenCalledTimes(4);
        expect(screen.getByRole('region')).not.toHaveTextContent(
            'human-workgroup',
        );
        expect(screen.getByRole('region')).not.toHaveTextContent(
            'human-results',
        );
    });
    it('uses placeholders for unknown routing fields', () => {
        renderWithProviders(
            <AthenaAgentSetup
                connection={{
                    ...connection,
                    region: '',
                    database: '',
                    schema: '',
                }}
                hasCredentials={false}
                tested={false}
            />,
        );
        const guide = screen.getByRole('region');
        expect(guide).toHaveTextContent('<region>');
        expect(guide).toHaveTextContent('<catalog>');
        expect(guide).toHaveTextContent('<glue-database>');
    });
    it('collapses saved setup and marks a verified account complete', async () => {
        renderWithProviders(
            <AthenaAgentSetup connection={connection} hasCredentials tested />,
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
