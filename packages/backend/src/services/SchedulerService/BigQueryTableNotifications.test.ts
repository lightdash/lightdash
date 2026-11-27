import { NotFoundError } from '@lightdash/common';
import {
    mockOrgAdmin1,
    mockOrgAdmin2,
} from '../AdminNotificationService/AdminNotificationService.mock';
import {
    notifyBigQueryTableFailure,
    type BigQueryTableFailureNotice,
} from './BigQueryTableNotifications';

const org = mockOrgAdmin1.organizationUuid;
const notice: BigQueryTableFailureNotice = {
    organizationUuid: org,
    ownerUuid: mockOrgAdmin1.userUuid,
    schedulerUuid: 'delivery-id',
    schedulerName: 'Inventory report',
    deliveryUrl:
        'https://app.example.test/projects/demo/saved/stock/view?scheduler_uuid=delivery-id&isSync=true',
    event: { type: 'attempt', jobId: '1398', attempt: 2 },
};

function fixture() {
    return {
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

describe('Google Sheets missing-table notifications', () => {
    it('identifies the failed worker attempt and links the verified owner to the delivery', async () => {
        const deps = fixture();
        await notifyBigQueryTableFailure(deps, notice, 'email');
        expect(
            deps.organizationMemberProfileModel.getOrganizationMemberByUuid,
        ).toHaveBeenCalledWith(org, notice.ownerUuid);
        const [[to, subject, , body]] =
            deps.emailClient.sendGenericNotificationEmail.mock.calls;
        expect(to).toEqual([mockOrgAdmin1.email]);
        expect(subject).toContain('Inventory report');
        expect(body).toContain('attempt 2 of job 1398');
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
        await notifyBigQueryTableFailure(deps, notice, 'email');
        expect(
            deps.organizationMemberProfileModel.getOrganizationAdmins,
        ).toHaveBeenCalledWith(org);
        expect(
            deps.emailClient.sendGenericNotificationEmail.mock.calls[0][0],
        ).toEqual([mockOrgAdmin2.email]);
    });

    it('sends separate pause copy to the configured organization channel', async () => {
        const deps = fixture();
        await notifyBigQueryTableFailure(
            deps,
            {
                ...notice,
                event: {
                    type: 'paused',
                    scheduledTime: '2026-11-26T12:00:00Z',
                },
            },
            'slack',
        );
        expect(deps.slackClient.getNotificationChannel).toHaveBeenCalledWith(
            org,
        );
        const [[message]] = deps.slackClient.postMessage.mock.calls;
        expect(message.channel).toBe('org-channel');
        expect(message.blocks[0].text.text).toContain(
            'at least five consecutive scheduled runs spanning at least seven days',
        );
        expect(message.blocks[0].text.text).toContain(
            'Future scheduled runs have stopped',
        );
        expect(message.blocks[0].accessory.url).toBe(notice.deliveryUrl);
        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).not.toHaveBeenCalled();
    });

    it('skips disabled email and organizations without a configured Slack channel', async () => {
        const deps = fixture();
        deps.emailClient.canSendEmail.mockReturnValue(false);
        deps.slackClient.getNotificationChannel.mockResolvedValue(undefined);
        await notifyBigQueryTableFailure(deps, notice, 'email');
        await notifyBigQueryTableFailure(deps, notice, 'slack');
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
            notifyBigQueryTableFailure(deps, notice, 'email'),
        ).rejects.toThrow('No active owner or organization admin');
        deps.organizationMemberProfileModel.getOrganizationMemberByUuid.mockRejectedValue(
            new Error('database unavailable'),
        );
        await expect(
            notifyBigQueryTableFailure(deps, notice, 'email'),
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
            notifyBigQueryTableFailure(deps, notice, 'email'),
        ).rejects.toThrow('SMTP down');
        await notifyBigQueryTableFailure(deps, notice, 'slack');
        deps.slackClient.postMessage.mockRejectedValue(
            new Error('channel unavailable'),
        );
        await expect(
            notifyBigQueryTableFailure(deps, notice, 'slack'),
        ).rejects.toThrow('channel unavailable');
        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).toHaveBeenCalledTimes(1);
    });
});
