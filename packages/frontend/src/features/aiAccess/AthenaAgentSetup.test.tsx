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
        renderWithProviders(<AthenaAgentSetup connection={connection} />);
        for (const title of [
            'Create the account in Athena',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        expect(
            screen.getByText(/Use a dedicated IAM user for agents/),
        ).toHaveTextContent('rotate its keys regularly');
        expect(
            screen.getByText(/Use a dedicated IAM user for agents/),
        ).toHaveTextContent('Keys from an assumed role expire within hours');
        expect(
            screen.getByText(/If you rotate keys automatically/),
        ).toHaveTextContent('use an IAM role instead');
        expect(
            screen.getByText(/Run as a Lake Formation administrator/),
        ).toHaveTextContent(
            'IAM user ARN, or the role ARN and not the session ARN',
        );
        expect(screen.getByText(/To limit rows or columns/)).toHaveTextContent(
            'grant a data filter instead',
        );
        expect(
            screen.getByText(/Test checks the AWS identity/),
        ).toHaveTextContent('Add the access keys');
    });
    it('copies each generated policy and grant with connection routing only', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        const { container } = renderWithProviders(
            <AthenaAgentSetup connection={connection} />,
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
        expect(container).not.toHaveTextContent('human-workgroup');
        expect(container).not.toHaveTextContent('human-results');
    });
    it('uses placeholders for unknown routing fields', () => {
        const { container } = renderWithProviders(
            <AthenaAgentSetup
                connection={{
                    ...connection,
                    region: '',
                    database: '',
                    schema: '',
                }}
            />,
        );
        const guide = container;
        expect(guide).toHaveTextContent('<region>');
        expect(guide).toHaveTextContent('<catalog>');
        expect(guide).toHaveTextContent('<glue-database>');
    });
});
