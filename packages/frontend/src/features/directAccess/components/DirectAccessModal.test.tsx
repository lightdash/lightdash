import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SpaceMemberRole,
    type DirectAccessAssignment,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    useDirectAccessAssignments,
    useResetDirectAccess,
    useRevokeDirectAccessAssignment,
    useUpsertDirectAccessAssignment,
} from '../hooks/useDirectAccess';
import DirectAccessModal from './DirectAccessModal';

vi.mock('../hooks/useDirectAccess', () => ({
    useDirectAccessAssignments: vi.fn(),
    useDirectAccessAvailability: vi.fn(() => ({
        isAvailable: true,
        isLoading: false,
    })),
    useUpsertDirectAccessAssignment: vi.fn(),
    useRevokeDirectAccessAssignment: vi.fn(),
    useResetDirectAccess: vi.fn(),
}));

vi.mock('../../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: vi.fn(() => ({
        data: [
            {
                userUuid: 'member-uuid',
                firstName: 'Mallory',
                lastName: 'Member',
                email: 'mallory@example.com',
            },
        ],
    })),
}));

vi.mock('../../projectGroupAccess/hooks/useProjectGroupAccess', () => ({
    useProjectGroupAccessList: vi.fn(() => ({
        data: [{ groupUuid: 'group-uuid', projectUuid: 'project-uuid' }],
    })),
}));

vi.mock('../../../hooks/useOrganizationGroups', () => ({
    useOrganizationGroups: vi.fn(() => ({
        data: [{ uuid: 'group-uuid', name: 'Analysts' }],
    })),
}));

const SESSION_USER_UUID = 'session-user-uuid';
const PROJECT_UUID = 'project-uuid';

const userAssignment = (
    overrides: Partial<DirectAccessAssignment> = {},
): DirectAccessAssignment => ({
    principal: {
        type: DirectAccessPrincipalType.USER,
        userUuid: 'viewer-uuid',
        firstName: 'Vera',
        lastName: 'Viewer',
        email: 'vera@example.com',
    },
    role: SpaceMemberRole.VIEWER,
    grantedByUserUuid: SESSION_USER_UUID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const groupAssignment = (): DirectAccessAssignment => ({
    principal: {
        type: DirectAccessPrincipalType.GROUP,
        groupUuid: 'group-uuid',
        name: 'Analysts',
    },
    role: SpaceMemberRole.EDITOR,
    grantedByUserUuid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
});

const mockedAssignments = vi.mocked(useDirectAccessAssignments);
const mockedUpsert = vi.mocked(useUpsertDirectAccessAssignment);
const mockedRevoke = vi.mocked(useRevokeDirectAccessAssignment);
const mockedReset = vi.mocked(useResetDirectAccess);

const upsertMutate = vi.fn();
const revokeMutate = vi.fn();
const resetMutate = vi.fn();
const refetch = vi.fn();

const mockAssignmentsQuery = (
    overrides: Partial<ReturnType<typeof useDirectAccessAssignments>> = {},
) => {
    mockedAssignments.mockReturnValue({
        data: [userAssignment(), groupAssignment()],
        isInitialLoading: false,
        isError: false,
        error: null,
        refetch,
        ...overrides,
    } as unknown as ReturnType<typeof useDirectAccessAssignments>);
};

const modalElement = (
    resourceType: DirectAccessResourceType = DirectAccessResourceType.DASHBOARD,
) => (
    <DirectAccessModal
        opened
        onClose={vi.fn()}
        projectUuid={PROJECT_UUID}
        resource={{
            resourceType,
            resourceUuid: 'resource-uuid',
            name: 'Revenue dashboard',
        }}
    />
);

const renderModal = (
    resourceType: DirectAccessResourceType = DirectAccessResourceType.DASHBOARD,
) =>
    renderWithProviders(modalElement(resourceType), {
        user: { userUuid: SESSION_USER_UUID },
    });

describe('DirectAccessModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAssignmentsQuery();
        mockedUpsert.mockReturnValue({
            mutate: upsertMutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useUpsertDirectAccessAssignment>);
        mockedRevoke.mockReturnValue({
            mutate: revokeMutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useRevokeDirectAccessAssignment>);
        mockedReset.mockReturnValue({
            mutate: resetMutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useResetDirectAccess>);
    });

    it.each(Object.values(DirectAccessResourceType))(
        'renders user and group assignments with the same contract for %s',
        async (resourceType) => {
            renderModal(resourceType);

            expect(
                await screen.findByText('Share "Revenue dashboard"'),
            ).toBeInTheDocument();
            expect(screen.getByText('Vera Viewer')).toBeInTheDocument();
            expect(screen.getByText('vera@example.com')).toBeInTheDocument();
            expect(screen.getByText('Analysts')).toBeInTheDocument();
            expect(
                screen.getByRole('textbox', { name: 'Role for Vera Viewer' }),
            ).toHaveValue('Can view');
            expect(
                screen.getByRole('textbox', { name: 'Role for Analysts' }),
            ).toHaveValue('Can edit');
            // one hook family: the query is keyed by the closed resource ref
            expect(mockedAssignments).toHaveBeenCalledWith(
                PROJECT_UUID,
                { resourceType, resourceUuid: 'resource-uuid' },
                expect.objectContaining({ enabled: true }),
            );
        },
    );

    it('replaces a principal role through the upsert mutation', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.click(
            screen.getByRole('textbox', { name: 'Role for Analysts' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Full access' }),
        );

        expect(upsertMutate).toHaveBeenCalledWith({
            principalType: DirectAccessPrincipalType.GROUP,
            principalUuid: 'group-uuid',
            role: SpaceMemberRole.ADMIN,
        });
    });

    it('revokes another principal without confirmation', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.click(
            screen.getByRole('button', {
                name: 'Remove access for Vera Viewer',
            }),
        );

        expect(revokeMutate).toHaveBeenCalledWith({
            principalType: DirectAccessPrincipalType.USER,
            principalUuid: 'viewer-uuid',
        });
    });

    it('asks for confirmation before self-revoke, then revokes', async () => {
        mockAssignmentsQuery({
            data: [
                userAssignment({
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        userUuid: SESSION_USER_UUID,
                        firstName: 'Sam',
                        lastName: 'Self',
                        email: 'sam@example.com',
                    },
                }),
            ],
        });
        const user = userEvent.setup();
        const { rerender } = renderModal();

        // wait for the session user to resolve so self-detection is active
        await screen.findByText('(you)');
        await user.click(
            screen.getByRole('button', { name: 'Remove access for Sam Self' }),
        );
        expect(revokeMutate).not.toHaveBeenCalled();
        expect(
            await screen.findByText('Remove your own access'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Remove' }));
        expect(revokeMutate).toHaveBeenCalledWith({
            principalType: DirectAccessPrincipalType.USER,
            principalUuid: SESSION_USER_UUID,
        });

        mockAssignmentsQuery({
            isError: true,
            error: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Policy access removed',
                    data: {},
                },
            },
        });
        rerender(modalElement());
        expect(
            screen.queryByRole('button', { name: 'Share' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Remove all access' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        mockAssignmentsQuery({ data: [] });
        rerender(modalElement());
        expect(
            screen.getByRole('button', { name: 'Share' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Could not load access'),
        ).not.toBeInTheDocument();
    });

    it('removes pending reset confirmation actions when policy access is lost', async () => {
        const user = userEvent.setup();
        const { rerender } = renderModal();
        await user.click(
            screen.getByRole('button', { name: 'Remove all access' }),
        );
        expect(
            screen.getByRole('button', { name: 'Remove' }),
        ).toBeInTheDocument();
        mockAssignmentsQuery({
            isError: true,
            error: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Policy access removed',
                    data: {},
                },
            },
        });
        rerender(modalElement());
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Remove' }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('button', { name: 'Done' }),
        ).toBeInTheDocument();
        expect(resetMutate).not.toHaveBeenCalled();
    });

    it('asks for confirmation before removing all access', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.click(
            screen.getByRole('button', { name: 'Remove all access' }),
        );
        expect(resetMutate).not.toHaveBeenCalled();
        expect(
            await screen.findByText('Remove all access'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Remove' }));
        expect(resetMutate).toHaveBeenCalledTimes(1);
    });

    it('adds a new principal with the selected role', async () => {
        const user = userEvent.setup();
        renderModal();

        await user.click(
            screen.getByRole('textbox', {
                name: 'Select a user or group to share with',
            }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Mallory Member' }),
        );
        await user.click(
            screen.getByRole('textbox', { name: 'Role for new assignment' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Can edit' }),
        );
        await user.click(screen.getByRole('button', { name: 'Share' }));

        expect(upsertMutate).toHaveBeenCalledWith({
            principalType: DirectAccessPrincipalType.USER,
            principalUuid: 'member-uuid',
            role: SpaceMemberRole.EDITOR,
        });
    });

    it('shows the empty state when nothing is assigned', async () => {
        mockAssignmentsQuery({ data: [] });
        renderModal();

        expect(
            await screen.findByText(
                'Not shared with anyone yet. People with access to the space can still see it.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Remove all access' }),
        ).not.toBeInTheDocument();
    });

    it('omits the space hint in the empty state for apps (may be personal)', async () => {
        mockAssignmentsQuery({ data: [] });
        renderModal(DirectAccessResourceType.APP);

        expect(
            await screen.findByText('Not shared with anyone yet.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(
                'Not shared with anyone yet. People with access to the space can still see it.',
            ),
        ).not.toBeInTheDocument();
    });

    it('shows a loading state while assignments resolve', () => {
        mockAssignmentsQuery({ data: undefined, isInitialLoading: true });
        renderModal();

        expect(screen.queryByText('Vera Viewer')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Share' }),
        ).not.toBeInTheDocument();
    });

    it('keeps focus in the dialog when a focused role disappears and Retry restores the policy', async () => {
        const user = userEvent.setup();
        const { rerender } = renderModal();
        const roleInput = screen.getByRole('textbox', {
            name: 'Role for Vera Viewer',
        });
        roleInput.focus();
        expect(roleInput).toHaveFocus();

        mockAssignmentsQuery({
            isError: true,
            error: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Policy access removed',
                    data: {},
                },
            },
        });
        rerender(modalElement());
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).toHaveFocus();
        expect(screen.getByRole('dialog')).toContainElement(
            document.activeElement as HTMLElement,
        );

        await user.click(retry);
        mockAssignmentsQuery();
        rerender(modalElement());
        const recipientInput = screen.getByRole('textbox', {
            name: 'Select a user or group to share with',
        });
        expect(recipientInput).toHaveFocus();
        expect(screen.getByRole('dialog')).toContainElement(
            document.activeElement as HTMLElement,
        );
    });

    it.each([403, 404, 500])(
        'removes mutation controls when refreshing cached policy returns %s',
        (statusCode) => {
            mockAssignmentsQuery({
                isError: true,
                error: {
                    status: 'error',
                    error: {
                        name: 'ForbiddenError',
                        statusCode,
                        message: 'Unable to read policy',
                        data: {},
                    },
                },
            });
            renderModal();
            expect(
                screen.getByText('Could not load access'),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Share' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Remove all access' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('textbox', { name: 'Role for Vera Viewer' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Retry' }),
            ).toBeInTheDocument();
        },
    );

    it('shows the error state and retries', async () => {
        mockAssignmentsQuery({
            data: undefined,
            isError: true,
            error: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Direct access is not available',
                    data: {},
                },
            },
        });
        const user = userEvent.setup();
        renderModal();

        expect(
            await screen.findByText('Could not load access'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Direct access is not available'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    });
});
