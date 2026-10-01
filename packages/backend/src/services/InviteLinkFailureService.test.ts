import {
    FeatureFlags,
    ForbiddenError,
    InviteLinkFailureReason,
    NotFoundError,
    TooManyRequestsError,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { LightdashConfig } from '../config/parseConfig';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import {
    InviteLinkProvenance,
    InviteLinkProvenanceModel,
} from '../models/InviteLinkProvenanceModel';
import { InviteLinkFailureService } from './InviteLinkFailureService';
import { inviteLink, sessionUser } from './UserService.mock';

const now = new Date('2026-10-01T12:00:00Z');
const dayMs = 24 * 60 * 60 * 1000;
const record: InviteLinkProvenance = {
    invite_code_hash: 'hashed-code',
    organization_uuid: 'organization-uuid',
    inviter_user_uuid: 'inviter-uuid',
    invitee_email: 'invitee@example.com',
    created_at: new Date(now.getTime() - dayMs),
    expires_at: new Date(now.getTime() + dayMs),
    last_requested_at: null,
    organizationName: 'Example organization',
    inviterName: 'Alex Smith',
    inviterEmail: 'alex@example.com',
};

const featureFlagModel = { get: vi.fn<FeatureFlagModel['get']>() };
const inviteLinkModel = {
    findExpiresAt: vi.fn<InviteLinkModel['findExpiresAt']>(),
};
const provenanceModel = {
    findByCode: vi.fn<InviteLinkProvenanceModel['findByCode']>(),
    upsert: vi.fn<InviteLinkProvenanceModel['upsert']>(),
    requestNew: vi.fn<InviteLinkProvenanceModel['requestNew']>(),
    deleteExpired: vi.fn<InviteLinkProvenanceModel['deleteExpired']>(),
};
const emailClient = {
    sendGenericNotificationEmail:
        vi.fn<EmailClient['sendGenericNotificationEmail']>(),
};
const analytics = { track: vi.fn() };

const createService = (smtp = true) =>
    new InviteLinkFailureService({
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://example.com',
            smtp: smtp
                ? ({ host: 'localhost' } as LightdashConfig['smtp'])
                : undefined,
        },
        featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
        inviteLinkModel: inviteLinkModel as unknown as InviteLinkModel,
        provenanceModel:
            provenanceModel as unknown as InviteLinkProvenanceModel,
        emailClient: emailClient as unknown as EmailClient,
        analytics: analytics as unknown as LightdashAnalytics,
    });

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    featureFlagModel.get.mockResolvedValue({
        id: FeatureFlags.ConnectJourney,
        enabled: true,
    });
    provenanceModel.findByCode.mockResolvedValue(record);
    inviteLinkModel.findExpiresAt.mockResolvedValue(null);
    provenanceModel.requestNew.mockImplementation(async (_code, send) =>
        send(),
    );
});

afterEach(() => vi.useRealTimers());

describe('invite failure lookup', () => {
    it('returns unknown without disclosing sender details', async () => {
        provenanceModel.findByCode.mockResolvedValue(undefined);
        expect(await createService().getFailure('unknown', null)).toEqual({
            reason: InviteLinkFailureReason.NotFound,
            organizationName: null,
            inviterName: null,
            canSendEmail: true,
            canRequestNewInvite: false,
        });
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.ConnectJourney,
        });
    });

    it('reports a used invite with provenance', async () => {
        expect(await createService().getFailure('used', null)).toEqual({
            reason: InviteLinkFailureReason.AlreadyUsed,
            organizationName: record.organizationName,
            inviterName: record.inviterName,
            canSendEmail: true,
            canRequestNewInvite: true,
        });
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it.each([null, now])(
        'reports expiry after deletion or at the expiry boundary: %s',
        async (expiresAt) => {
            inviteLinkModel.findExpiresAt.mockResolvedValue(expiresAt);
            provenanceModel.findByCode.mockResolvedValue({
                ...record,
                expires_at: now,
            });
            expect(
                (await createService().getFailure('expired', null)).reason,
            ).toBe(InviteLinkFailureReason.Expired);
        },
    );

    it('does not claim that a valid invite failed', async () => {
        inviteLinkModel.findExpiresAt.mockResolvedValue(record.expires_at);
        expect(
            (await createService().getFailure('valid', null)).reason,
        ).toBeNull();
    });

    it('has no request button without SMTP', async () => {
        expect(
            await createService(false).getFailure('used', null),
        ).toMatchObject({ canSendEmail: false, canRequestNewInvite: false });
    });

    it('handles a deleted inviter', async () => {
        provenanceModel.findByCode.mockResolvedValue({
            ...record,
            inviterName: null,
            inviterEmail: null,
            inviter_user_uuid: null,
        });
        expect(await createService().getFailure('used', null)).toMatchObject({
            inviterName: null,
            canRequestNewInvite: false,
        });
    });

    it('resolves the signed-in user flag', async () => {
        await createService().getFailure('code', sessionUser);
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.ConnectJourney,
            user: sessionUser,
        });
    });

    it('rejects lookup when the flag is off before reading any rows', async () => {
        featureFlagModel.get.mockResolvedValue({
            id: FeatureFlags.ConnectJourney,
            enabled: false,
        });
        await expect(createService().getFailure('code', null)).rejects.toThrow(
            ForbiddenError,
        );
        expect(provenanceModel.findByCode).not.toHaveBeenCalled();
        expect(inviteLinkModel.findExpiresAt).not.toHaveBeenCalled();
    });
});

describe('request a new invite', () => {
    it('emails the inviter with the recorded invitee, organization and settings URL', async () => {
        await createService().requestNew('code', null);
        expect(emailClient.sendGenericNotificationEmail).toHaveBeenCalledWith(
            ['alex@example.com'],
            'A new invite was requested',
            'A new invite was requested',
            'invitee@example.com asked for a new invite to Example organization.\n\nSend a new invite from https://example.com/generalSettings/userManagement',
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'invite_link.new_invite_requested',
                properties: { organizationId: record.organization_uuid },
            }),
        );
    });

    it('rejects a missing record', async () => {
        provenanceModel.findByCode.mockResolvedValue(undefined);
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            NotFoundError,
        );
        expect(provenanceModel.requestNew).not.toHaveBeenCalled();
        expect(emailClient.sendGenericNotificationEmail).not.toHaveBeenCalled();
    });

    it('rejects when SMTP is absent', async () => {
        await expect(
            createService(false).requestNew('code', null),
        ).rejects.toThrow(ForbiddenError);
        expect(provenanceModel.requestNew).not.toHaveBeenCalled();
    });

    it('rejects when the inviter has no email', async () => {
        provenanceModel.findByCode.mockResolvedValue({
            ...record,
            inviterEmail: null,
        });
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            NotFoundError,
        );
        expect(provenanceModel.requestNew).not.toHaveBeenCalled();
    });

    it('rejects requests within 24 hours', async () => {
        provenanceModel.findByCode.mockResolvedValue({
            ...record,
            last_requested_at: new Date(now.getTime() - dayMs + 1),
        });
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            TooManyRequestsError,
        );
        expect(provenanceModel.requestNew).not.toHaveBeenCalled();
    });

    it('allows a request exactly 24 hours later', async () => {
        provenanceModel.findByCode.mockResolvedValue({
            ...record,
            last_requested_at: new Date(now.getTime() - dayMs),
        });
        await createService().requestNew('code', null);
        expect(emailClient.sendGenericNotificationEmail).toHaveBeenCalledOnce();
    });

    it('honours the atomic model check if another request wins the race', async () => {
        provenanceModel.requestNew.mockRejectedValue(
            new TooManyRequestsError(),
        );
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            TooManyRequestsError,
        );
        expect(emailClient.sendGenericNotificationEmail).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('does not track successful requests when sending fails', async () => {
        emailClient.sendGenericNotificationEmail.mockRejectedValue(
            new Error('SMTP failed'),
        );
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            'SMTP failed',
        );
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('rejects requests when the flag is off', async () => {
        featureFlagModel.get.mockResolvedValue({
            id: FeatureFlags.ConnectJourney,
            enabled: false,
        });
        await expect(createService().requestNew('code', null)).rejects.toThrow(
            ForbiddenError,
        );
        expect(provenanceModel.findByCode).not.toHaveBeenCalled();
        expect(emailClient.sendGenericNotificationEmail).not.toHaveBeenCalled();
    });
});

describe('provenance and failure analytics', () => {
    it('records each created invite using the inviter flag', async () => {
        await createService().recordInvite(inviteLink, sessionUser);
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.ConnectJourney,
            user: sessionUser,
        });
        expect(provenanceModel.upsert).toHaveBeenCalledWith(
            inviteLink,
            sessionUser,
        );
    });

    it.each([
        [
            InviteLinkFailureReason.Expired,
            record,
            InviteLinkFailureReason.Expired,
        ],
        [
            InviteLinkFailureReason.NotFound,
            record,
            InviteLinkFailureReason.AlreadyUsed,
        ],
        [
            InviteLinkFailureReason.NotFound,
            { ...record, expires_at: now },
            InviteLinkFailureReason.Expired,
        ],
        [
            InviteLinkFailureReason.NotFound,
            undefined,
            InviteLinkFailureReason.NotFound,
        ],
        [
            InviteLinkFailureReason.WrongEmail,
            record,
            InviteLinkFailureReason.WrongEmail,
        ],
    ])(
        'tracks %s using retained provenance',
        async (reason, provenance, expected) => {
            provenanceModel.findByCode.mockResolvedValue(provenance);
            await createService().trackFailure('code', reason);
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'invite_link.failed',
                    properties: {
                        reason: expected,
                        hasProvenance: !!provenance,
                        organizationId: provenance?.organization_uuid ?? null,
                    },
                }),
            );
        },
    );

    it('retains a known organization in wrong-email analytics without provenance', async () => {
        provenanceModel.findByCode.mockResolvedValue(undefined);
        await createService().trackFailure(
            'code',
            InviteLinkFailureReason.WrongEmail,
            null,
            'known-organization',
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: {
                    reason: InviteLinkFailureReason.WrongEmail,
                    hasProvenance: false,
                    organizationId: 'known-organization',
                },
            }),
        );
    });

    it('does not record, track, or clean up when the flag is off', async () => {
        featureFlagModel.get.mockResolvedValue({
            id: FeatureFlags.ConnectJourney,
            enabled: false,
        });
        const service = createService();
        await service.recordInvite(inviteLink, sessionUser);
        await service.trackFailure('code', InviteLinkFailureReason.NotFound);
        await service.cleanup();
        expect(provenanceModel.upsert).not.toHaveBeenCalled();
        expect(provenanceModel.findByCode).not.toHaveBeenCalled();
        expect(provenanceModel.deleteExpired).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('cleans up retained records through the model', async () => {
        await createService().cleanup();
        expect(provenanceModel.deleteExpired).toHaveBeenCalledOnce();
    });
});
