import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    type PossibleAbilities,
    type Project,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbilityContext } from '../../providers/Ability/context';
import UpdateProjectConnection from './UpdateProjectConnection';

const mocks = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            organizationUuid: 'organization',
            projectUuid: 'project',
            name: 'Test project',
            type: ProjectType.DEFAULT,
            dbtConnection: { type: DbtProjectType.NONE },
            warehouseConnection: { type: WarehouseTypes.BIGQUERY },
        } as Project,
    }),
    useUpdateMutation: () => ({ isIdle: true, mutateAsync: vi.fn() }),
    useUpdateWarehouseCredentialsMutation: () => ({ mutate: vi.fn() }),
    useTestWarehouseConnectionMutation: () => ({
        mutate: vi.fn(),
        reset: vi.fn(),
    }),
}));
vi.mock('../../hooks/useProjectCompileLogs', () => ({
    useProjectCompileLogs: () => ({ data: undefined }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.enabled } }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationUuid: 'organization' } },
        health: { data: {} },
    }),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('./ProjectForm', () => ({ ProjectForm: () => null }));
vi.mock('./useOnProjectError', () => ({ useOnProjectError: () => vi.fn() }));

const renderConnection = (manageProjectUuid: string | null) => {
    const ability = new Ability<PossibleAbilities>([
        {
            action: 'update',
            subject: 'Project',
            conditions: {
                organizationUuid: 'organization',
                projectUuid: 'project',
            },
        },
        ...(manageProjectUuid === null
            ? []
            : [
                  {
                      action: 'manage' as const,
                      subject: 'Project' as const,
                      conditions: {
                          organizationUuid: 'organization',
                          projectUuid: manageProjectUuid,
                      },
                  },
              ]),
    ]);
    return render(
        <MantineProvider>
            <MemoryRouter>
                <AbilityContext.Provider value={ability}>
                    <UpdateProjectConnection projectUuid="project" />
                </AbilityContext.Provider>
            </MemoryRouter>
        </MantineProvider>,
    );
};

describe('UpdateProjectConnection agent identity link', () => {
    beforeEach(() => {
        mocks.enabled = true;
    });

    it('hides the moved-settings line when update is allowed but manage is denied', () => {
        renderConnection(null);
        expect(
            screen.getByRole('button', { name: 'Save and test' }),
        ).toBeEnabled();
        expect(
            screen.queryByText(/AI service account settings moved to/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Agent identity' }),
        ).not.toBeInTheDocument();
    });

    it('shows the moved-settings line when manage is allowed and the flag is on', () => {
        renderConnection('project');
        expect(
            screen.getByText(/AI service account settings moved to/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Agent identity' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/agentIdentity',
        );
    });

    it('hides the moved-settings line when the flag is off', () => {
        mocks.enabled = false;
        renderConnection('project');
        expect(
            screen.queryByText(/AI service account settings moved to/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Agent identity' }),
        ).not.toBeInTheDocument();
    });

    it('does not use management permission from another project', () => {
        renderConnection('other-project');
        expect(
            screen.queryByText(/AI service account settings moved to/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Agent identity' }),
        ).not.toBeInTheDocument();
    });
});
