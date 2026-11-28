import {
    ChartType,
    type ComposerChartPipeline,
    type ComposerStoredChart,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../testing/testUtils';
import { SaveComposerChartModal } from './SaveComposerChartModal';

const mocks = vi.hoisted(() => ({
    showToastSuccess: vi.fn(),
    showToastError: vi.fn(),
    showToastApiError: vi.fn(),
}));
vi.mock('../../../api');
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => mocks,
}));

vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({ data: { isRegisteredUser: () => true } }),
}));

// Charts can go in Team and its child; dashboards only in Reports.
const abilityRules = [
    {
        action: 'create',
        subject: 'SavedChart',
        conditions: { uuid: { $in: ['team', 'team-child'] } },
    },
    {
        action: 'create',
        subject: 'Dashboard',
        conditions: { uuid: { $in: ['reports'] } },
    },
] as LightdashUserWithAbilityRules['abilityRules'];

const space = (uuid: string, name: string, parentSpaceUuid: string | null) => ({
    uuid,
    name,
    path: parentSpaceUuid ? `${parentSpaceUuid}.${uuid}` : uuid,
    parentSpaceUuid,
    projectUuid: 'project',
    organizationUuid: 'org',
    access: [],
    inheritsFromOrgOrProject: true,
    userAccess: undefined,
});
const spaces = [
    space('team-child', 'Team child', 'team'),
    space('reports', 'Reports', null),
    space('team', 'Team', null),
];

type ApiCall = { url: string; method?: string; body?: string };
const bodyOf = (url: string, method: string) => {
    const call = mockedLightdashApi.mock.calls
        .map(([args]) => args as ApiCall)
        .find((args) => args.url === url && args.method === method);
    return call?.body ? JSON.parse(call.body) : undefined;
};

const renderModal = (onSaved = vi.fn().mockResolvedValue(undefined)) => {
    renderWithProviders(
        <MemoryRouter>
            <SaveComposerChartModal
                projectUuid="project"
                onClose={vi.fn()}
                name="Orders by week"
                description=""
                pipeline={{ nodes: [] } as unknown as ComposerChartPipeline}
                chart={
                    {
                        chartConfig: { type: ChartType.CARTESIAN },
                    } as unknown as ComposerStoredChart
                }
                onSaved={onSaved}
            />
        </MemoryRouter>,
        { user: { abilityRules } },
    );
    return onSaved;
};

describe('SaveComposerChartModal to a space', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockImplementation((async ({
            url,
            method,
        }: ApiCall) => {
            if (url === '/projects/project/spaces' && method === 'GET')
                return spaces;
            if (url === '/projects/project/spaces/' && method === 'POST')
                return { uuid: 'new-space', name: 'Drafts' };
            if (url === '/projects/project/composer-charts')
                return { uuid: 'chart-uuid' };
            return [];
        }) as never);
    });

    it('saves to the first top-level chart space by default, then links the answer', async () => {
        const onSaved = renderModal();
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'Space' })).toBeEnabled(),
        );
        expect(screen.getByRole('radio', { name: 'Space' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        expect(await screen.findByText('Team')).toBeInTheDocument();
        expect(screen.queryByText('Reports')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(onSaved).toHaveBeenCalledWith({
                composerChartUuid: 'chart-uuid',
                dashboardUuid: null,
            }),
        );
        expect(
            bodyOf('/projects/project/composer-charts', 'POST'),
        ).toMatchObject({ spaceUuid: 'team', name: 'Orders by week' });
        expect(
            bodyOf('/projects/project/composer-charts', 'POST'),
        ).not.toHaveProperty('dashboardUuid');
        expect(mocks.showToastSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Chart saved to "Team"',
                action: expect.objectContaining({ children: 'Open' }),
            }),
        );
    });

    it('creates a new space nested under the selected one and private', async () => {
        renderModal();
        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'Space' })).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'New Space' }),
        );
        fireEvent.change(screen.getByPlaceholderText('Space name'), {
            target: { value: 'Drafts' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(
                bodyOf('/projects/project/composer-charts', 'POST'),
            ).toMatchObject({ spaceUuid: 'new-space' }),
        );
        expect(bodyOf('/projects/project/spaces/', 'POST')).toEqual({
            name: 'Drafts',
            parentSpaceUuid: 'team',
            inheritParentPermissions: false,
        });
        expect(mocks.showToastSuccess).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Chart saved to "Drafts"' }),
        );
    });
});
