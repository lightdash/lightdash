import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiSqlArtifactActions } from './AiSqlArtifactVisualization';

vi.mock('../../../../../hooks/user/useCreateInAnySpaceAccess', () => ({
    default: () => true,
}));

vi.mock('../../hooks/useProjectAiAgents', () => ({
    useUpdateArtifactVersionSavedSql: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock(
    '../../../../../features/sqlRunner/components/SaveSqlChartModal',
    () => ({ SaveSqlChartModalContent: () => null }),
);

vi.mock('../../../../../hooks/user/useUser', () => ({
    default: () => ({
        data: { organizationUuid: 'organization-uuid' },
    }),
}));

vi.mock('../../../../../providers/Ability', () => ({
    Can: ({ children }: { children: ReactNode }) => children,
}));

describe('AiSqlArtifactActions', () => {
    it('opens the shared export dialog from Download results', async () => {
        renderWithProviders(
            <MemoryRouter>
                <AiSqlArtifactActions
                    projectUuid="project-uuid"
                    agentUuid="agent-uuid"
                    artifactUuid="artifact-uuid"
                    versionUuid="version-uuid"
                    savedSqlUuid={null}
                    sql="select * from orders"
                    limit={25}
                    queryUuid="artifact-query-uuid"
                    totalResults={25}
                    title="SQL results"
                    description={null}
                    columns={[]}
                />
            </MemoryRouter>,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'SQL artifact actions' }),
        );
        await userEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Download results',
            }),
        );

        expect(screen.getByRole('dialog')).toBeVisible();
        expect(screen.getByText('Export Data')).toBeVisible();
        expect(await screen.findByText('Table rows')).toBeVisible();
        expect(screen.getByText('All results')).toBeVisible();
        expect(screen.getByText('Custom')).toBeVisible();
    });
});
