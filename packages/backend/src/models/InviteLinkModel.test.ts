import {
    ExpiredError,
    InviteLinkPurpose,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { InviteLinkModel } from './InviteLinkModel';

const inviteCode = 'test-invite-code';
const userUuid = '22222222-2222-4222-8222-222222222222';

const dbRow = {
    invite_code_hash: InviteLinkModel._hash(inviteCode),
    organization_id: 1,
    organization_uuid: '11111111-1111-4111-8111-111111111111',
    user_uuid: userUuid,
    email: 'invitee@example.com',
    purpose: 'member',
    created_at: new Date('2026-07-15T12:00:00.000Z'),
    expires_at: new Date('2099-07-15T12:00:00.000Z'),
};

const createDatabase = (rows: unknown[]) => {
    const selectBuilder = {
        leftJoin: vi.fn(),
        joinRaw: vi.fn(),
        where: vi.fn(),
        select: vi.fn(async () => rows),
    };
    selectBuilder.leftJoin.mockReturnValue(selectBuilder);
    selectBuilder.joinRaw.mockReturnValue(selectBuilder);
    selectBuilder.where.mockReturnValue(selectBuilder);
    const deleteBuilder = {
        where: vi.fn(),
        delete: vi.fn(async () => 1),
    };
    deleteBuilder.where.mockReturnValue(deleteBuilder);
    const database = vi
        .fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(deleteBuilder) as unknown as Knex;
    return { database, selectBuilder, deleteBuilder };
};

describe('InviteLinkModel', () => {
    describe('getByCode', () => {
        it('returns the invite link when it is not expired', async () => {
            const { database } = createDatabase([dbRow]);
            const model = new InviteLinkModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });

            await expect(model.getByCode(inviteCode)).resolves.toEqual({
                inviteCode,
                expiresAt: dbRow.expires_at,
                inviteUrl: `https://test.lightdash.cloud/invite/${inviteCode}`,
                organizationUuid: dbRow.organization_uuid,
                userUuid,
                email: dbRow.email,
                purpose: InviteLinkPurpose.Member,
            });
        });

        it('deletes and rejects an expired invite link', async () => {
            const { database, deleteBuilder } = createDatabase([
                { ...dbRow, expires_at: new Date('2000-01-01T00:00:00.000Z') },
            ]);
            const model = new InviteLinkModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });

            await expect(model.getByCode(inviteCode)).rejects.toThrow(
                new ExpiredError('Invite link expired'),
            );
            expect(deleteBuilder.where).toHaveBeenCalledWith(
                'invite_code_hash',
                InviteLinkModel._hash(inviteCode),
            );
            expect(deleteBuilder.delete).toHaveBeenCalledOnce();
        });

        it('throws not found for an unknown invite code', async () => {
            const { database, deleteBuilder } = createDatabase([]);
            const model = new InviteLinkModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });

            await expect(model.getByCode('unknown')).rejects.toThrow(
                new NotFoundError('No invite link found'),
            );
            expect(deleteBuilder.delete).not.toHaveBeenCalled();
        });
    });
});
