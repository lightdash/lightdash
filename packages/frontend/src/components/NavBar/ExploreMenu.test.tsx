import {
    FeatureFlags,
    SpaceMemberRole,
    type LightdashUserWithAbilityRules,
    type SpaceSummary,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import { defaultAbility } from '../../providers/Ability/constants';
import { renderWithProviders } from '../../testing/testUtils';
import ExploreMenu from './ExploreMenu';

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../../hooks/useSpaces', () => ({
    useSpaceSummaries: vi.fn(),
}));

const projectUuid = 'project-1';
const userUuid = 'b264d83a-9000-426a-85ec-3f9c20f368ce';

const editorAbilityRules: LightdashUserWithAbilityRules['abilityRules'] = [
    {
        action: 'manage',
        subject: 'Explore',
        conditions: { projectUuid },
    },
    {
        action: 'manage',
        subject: 'Dashboard',
        conditions: {
            projectUuid,
            access: {
                $elemMatch: {
                    userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        },
    },
];

const editableSpace = {
    organizationUuid: 'organization-1',
    projectUuid,
    uuid: 'space-1',
    name: 'Editable space',
    userAccess: {
        userUuid,
        role: SpaceMemberRole.EDITOR,
        hasDirectAccess: true,
        projectRole: undefined,
        inheritedRole: undefined,
        inheritedFrom: undefined,
    },
    access: [userUuid],
} as SpaceSummary;

const renderMenu = async () => {
    renderWithProviders(
        <MemoryRouter>
            <ExploreMenu projectUuid={projectUuid} />
        </MemoryRouter>,
        { user: { abilityRules: editorAbilityRules } },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New' }));
};

describe('ExploreMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        defaultAbility.update(editorAbilityRules);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.EnableDataApps, enabled: false },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    afterEach(() => {
        defaultAbility.update([]);
    });

    it('shows dashboard creation when an editor can create in a destination space', async () => {
        vi.mocked(useSpaceSummaries).mockReturnValue({
            data: [editableSpace],
        } as unknown as ReturnType<typeof useSpaceSummaries>);

        await renderMenu();

        expect(
            await screen.findByTestId('ExploreMenu/NewDashboardButton'),
        ).toBeInTheDocument();
    });

    it('hides dashboard creation without an editable destination space', async () => {
        vi.mocked(useSpaceSummaries).mockReturnValue({
            data: [{ ...editableSpace, userAccess: undefined }],
        } as unknown as ReturnType<typeof useSpaceSummaries>);

        await renderMenu();

        expect(
            screen.queryByTestId('ExploreMenu/NewDashboardButton'),
        ).not.toBeInTheDocument();
    });
});
