import { Ability, AbilityBuilder } from '@casl/ability';
import { OrganizationMemberRole, type MemberAbility } from '@lightdash/common';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Roadmap from './Roadmap';

const { useApp, renderProjects } = vi.hoisted(() => ({
    useApp: vi.fn(),
    renderProjects: vi.fn(() => null),
}));
vi.mock('../../providers/App/useApp', () => ({ default: useApp }));
vi.mock('../features/roadmap/RoadmapProjects', () => ({
    RoadmapProjects: renderProjects,
}));

describe('roadmap follow access', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        {
            role: OrganizationMemberRole.MEMBER,
            action: 'manage',
            organizationUuid: 'org-1',
            allowed: true,
        },
        {
            role: OrganizationMemberRole.ADMIN,
            action: 'view',
            organizationUuid: 'org-1',
            allowed: false,
        },
        {
            role: OrganizationMemberRole.MEMBER,
            action: 'manage',
            organizationUuid: 'org-2',
            allowed: false,
        },
    ] as const)(
        'uses the current organization ability: %j',
        ({ role, action, organizationUuid, allowed }) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            builder.can(action, 'Roadmap', { organizationUuid });
            useApp.mockReturnValue({
                user: {
                    data: {
                        organizationUuid: 'org-1',
                        userUuid: 'user-1',
                        role,
                        ability: builder.build(),
                    },
                },
            });
            render(<Roadmap />);
            expect(renderProjects).toHaveBeenCalledWith(
                expect.objectContaining({ canFollow: allowed }),
                undefined,
            );
        },
    );
});
