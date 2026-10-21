import {
    OrganizationMemberRole,
    type GroupWithMembers,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../../api';
import { renderWithProviders } from '../../../testing/testUtils';
import CreateGroupModal from './CreateGroupModal';

const orgUser = (userUuid: string, email: string) => ({
    userUuid,
    email,
    firstName: '',
    lastName: '',
    organizationUuid: 'organization-uuid',
    role: OrganizationMemberRole.MEMBER,
    isActive: true,
    isInviteExpired: false,
    isPending: false,
});

const orgUsers = [
    orgUser('user-c', 'charlie@example.com'),
    orgUser('user-a', 'alice@example.com'),
    orgUser('user-b', 'Bob@example.com'),
];

const groupToEdit = {
    uuid: 'group-uuid',
    name: 'Analysts',
    organizationUuid: 'organization-uuid',
    createdAt: new Date(),
    createdByUserUuid: null,
    updatedAt: new Date(),
    updatedByUserUuid: null,
    members: orgUsers.map(({ userUuid, email }) => ({
        userUuid,
        email,
        firstName: '',
        lastName: '',
    })),
    memberUuids: orgUsers.map((u) => u.userUuid),
} as GroupWithMembers;

describe('CreateGroupModal', () => {
    it('lists existing members alphabetically by email', async () => {
        nock(BASE_API_URL)
            .get('/api/v1/org/users')
            .query(true)
            .reply(200, {
                status: 'ok',
                results: { data: orgUsers },
            });

        renderWithProviders(
            <CreateGroupModal
                opened
                onClose={vi.fn()}
                isEditing
                groupToEdit={groupToEdit}
            />,
            {
                user: {
                    role: OrganizationMemberRole.ADMIN,
                    abilityRules: [{ action: 'manage', subject: 'Group' }],
                },
            },
        );

        await screen.findAllByText('alice@example.com');
        await waitFor(() =>
            expect(
                Array.from(
                    document.querySelectorAll('.mantine-Pill-label'),
                ).map((pill) => pill.textContent),
            ).toEqual([
                'alice@example.com',
                'Bob@example.com',
                'charlie@example.com',
            ]),
        );
    });
});
