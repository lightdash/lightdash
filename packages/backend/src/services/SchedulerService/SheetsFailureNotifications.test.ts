import { NotFoundError } from '@lightdash/common';
import {
    mockOrgAdmin1,
    mockOrgAdmin2,
} from '../AdminNotificationService/AdminNotificationService.mock';
import {
    notifySheetsFailure,
    type SheetsFailureNotification,
} from './SheetsFailureNotifications';

const org = mockOrgAdmin1.organizationUuid;
const notice: SheetsFailureNotification = {
    organizationUuid: org,
    ownerUuid: mockOrgAdmin1.userUuid,
    schedulerUuid: 'delivery-id',
    schedulerName: 'Inventory report',
    deliveryUrl:
        'https://app.example.test/projects/demo/saved/stock/view?scheduler_uuid=delivery-id&isSync=true',
    event: {
        type: 'paused',
        scheduledTime: '2026-11-26T12:00:00Z',
        reason: 'Google Sheets rejected the upload.',
    },
};

function fixture() {
    return {
        serviceAccountModel: {
            getCreatorForAccountUser: vi
                .fn<(org: string, user: string) => Promise<string | null>>()
                .mockResolvedValue(null),
        },
        emailClient: {
            canSendEmail: vi.fn(() => true),
            sendGenericNotificationEmail: vi.fn().mockResolvedValue(undefined),
        },
        slackClient: {
            isEnabled: true,
            getNotificationChannel: vi.fn().mockResolvedValue('org-channel'),
            postMessage: vi.fn().mockResolvedValue({ ok: true }),
        },
        organizationMemberProfileModel: {
            getOrganizationMemberByUuid: vi
                .fn()
                .mockResolvedValue(mockOrgAdmin1),
            getOrganizationAdmins: vi.fn().mockResolvedValue([mockOrgAdmin2]),
        },
        emailModel: {
            getPrimaryEmailStatus: vi.fn(async (userUuid: string) => ({
                isVerified: true,
                email:
                    userUuid === mockOrgAdmin1.userUuid
                        ? mockOrgAdmin1.email
                        : mockOrgAdmin2.email,
            })),
        },
    };
}

describe('Google Sheets failure notifications', () => {
    it('sends the pause reason and settings link to the verified owner', async () => {
        const deps = fixture();
        await notifySheetsFailure(deps, notice, 'email');
        expect(
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid,
        ).toHaveBeenCalledWith(org, notice.ownerUuid);
        const [[to, subject, , body]] =
            deps.emailClient.sendGenericNotificationEmail.mock.calls;
        expect(to).toEqual([mockOrgAdmin1.email]);
        expect(subject).toContain('Inventory report');
        expect(body).toContain(notice.event.reason);
        expect(body).toContain(notice.deliveryUrl);
        expect(
            deps.organizationMemberProfileModel.getOrganizationAdmins,
        ).not.toHaveBeenCalled();
        expect(deps.slackClient.postMessage).not.toHaveBeenCalled();
    });

    it.each([
        'service account',
        'inactive',
        'pending',
        'unverified',
        'no primary email',
    ])('uses a verified active admin for an owner who is %s', async (owner) => {
        const deps = fixture();
        if (owner === 'service account') {
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid.mockRejectedValue(
                new NotFoundError('No human member'),
            );
        } else if (owner === 'inactive') {
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid.mockResolvedValue(
                { ...mockOrgAdmin1, isActive: false },
            );
        } else if (owner === 'pending') {
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid.mockResolvedValue(
                { ...mockOrgAdmin1, isPending: true },
            );
        } else if (owner === 'unverified') {
            deps.emailModel.getPrimaryEmailStatus.mockResolvedValueOnce({
                email: mockOrgAdmin1.email,
                isVerified: false,
            });
        } else {
            deps.emailModel.getPrimaryEmailStatus.mockRejectedValueOnce(
                new NotFoundError('No primary email'),
            );
        }
        await notifySheetsFailure(deps, notice, 'email');
        expect(
            deps.organizationMemberProfileModel.getOrganizationAdmins,
        ).toHaveBeenCalledWith(org);
        expect(
            deps.emailClient.sendGenericNotificationEmail.mock.calls[0][0],
        ).toEqual([mockOrgAdmin2.email]);
    });

    it.each([
        'verified',
        'left organization',
        'unverified',
        'inactive',
    ] as const)(
        'routes a permanent pause when the service account creator is %s',
        async (status) => {
            const deps = fixture();
            const creator = { ...mockOrgAdmin1, userUuid: 'creator' };
            const getMember =
                deps.organizationMemberProfileModel.getOrganizationMemberByUuid;
            getMember.mockRejectedValueOnce(
                new NotFoundError('Service account'),
            );
            if (status === 'left organization') {
                getMember.mockRejectedValueOnce(
                    new NotFoundError('No matching member'),
                );
            } else {
                getMember.mockResolvedValueOnce({
                    ...creator,
                    isActive: status !== 'inactive',
                });
            }
            deps.serviceAccountModel.getCreatorForAccountUser.mockResolvedValue(
                creator.userUuid,
            );
            deps.emailModel.getPrimaryEmailStatus.mockImplementation(
                async (id) => ({
                    email:
                        id === creator.userUuid
                            ? 'creator@example.test'
                            : mockOrgAdmin2.email,
                    isVerified:
                        id !== creator.userUuid || status !== 'unverified',
                }),
            );
            const reason =
                'This Google Sheets sync does not have access to a required resource.';
            await notifySheetsFailure(
                deps,
                {
                    ...notice,
                    event: {
                        type: 'paused',
                        reason,
                        scheduledTime: '2026-11-26T12:00:00Z',
                    },
                },
                'email',
            );
            expect(
                deps.serviceAccountModel.getCreatorForAccountUser,
            ).toHaveBeenCalledWith(org, notice.ownerUuid);
            expect(getMember).toHaveBeenNthCalledWith(2, org, creator.userUuid);
            expect(
                deps.emailClient.sendGenericNotificationEmail,
            ).toHaveBeenCalledExactlyOnceWith(
                [
                    status === 'verified'
                        ? 'creator@example.test'
                        : mockOrgAdmin2.email,
                ],
                expect.stringContaining('paused'),
                expect.any(String),
                expect.stringContaining(reason),
            );
            expect(
                deps.organizationMemberProfileModel.getOrganizationAdmins,
            ).toHaveBeenCalledTimes(status === 'verified' ? 0 : 1);
        },
    );

    it('sends the pause to the configured organization channel', async () => {
        const deps = fixture();
        await notifySheetsFailure(deps, notice, 'slack');
        expect(deps.slackClient.getNotificationChannel).toHaveBeenCalledWith(
            org,
        );
        const [[message]] = deps.slackClient.postMessage.mock.calls;
        expect(message.channel).toBe('org-channel');
        expect(message.blocks[0].text.text).toContain(notice.event.reason);
        expect(message.blocks[0].accessory.url).toBe(notice.deliveryUrl);
        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).not.toHaveBeenCalled();
    });

    it('skips disabled email and organizations without a configured Slack channel', async () => {
        const deps = fixture();
        deps.emailClient.canSendEmail.mockReturnValue(false);
        deps.slackClient.getNotificationChannel.mockResolvedValue(undefined);
        await notifySheetsFailure(deps, notice, 'email');
        await notifySheetsFailure(deps, notice, 'slack');
        expect(
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid,
        ).not.toHaveBeenCalled();
        expect(deps.slackClient.postMessage).not.toHaveBeenCalled();
    });

    it('surfaces missing verified recipients and directory errors to the job runner', async () => {
        const deps = fixture();
        deps.emailModel.getPrimaryEmailStatus.mockResolvedValue({
            email: 'ignored@example.com',
            isVerified: false,
        });
        await expect(
            notifySheetsFailure(deps, notice, 'email'),
        ).rejects.toThrow(
            'No active owner, service account creator, or organization admin',
        );
        deps.organizationMemberProfileModel.getOrganizationMemberByUuid.mockRejectedValue(
            new Error('database unavailable'),
        );
        await expect(
            notifySheetsFailure(deps, notice, 'email'),
        ).rejects.toThrow('database unavailable');
        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).not.toHaveBeenCalled();
    });

    it('propagates failures on each channel independently for retry', async () => {
        const deps = fixture();
        deps.emailClient.sendGenericNotificationEmail.mockRejectedValue(
            new Error('SMTP down'),
        );
        await expect(
            notifySheetsFailure(deps, notice, 'email'),
        ).rejects.toThrow('SMTP down');
        await notifySheetsFailure(deps, notice, 'slack');
        deps.slackClient.postMessage.mockRejectedValue(
            new Error('channel unavailable'),
        );
        await expect(
            notifySheetsFailure(deps, notice, 'slack'),
        ).rejects.toThrow('channel unavailable');
        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).toHaveBeenCalledTimes(1);
    });
});
