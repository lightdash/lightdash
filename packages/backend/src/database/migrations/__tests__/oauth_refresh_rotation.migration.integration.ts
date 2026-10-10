import OAuth2Server from '@node-oauth/oauth2-server';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../../models/OAuth2Model';
import { UserModel } from '../../../models/UserModel';
import { OAuthService } from '../../../services/OAuthService/OAuthService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => vi.restoreAllMocks());

const fixture = async (legacy: boolean) => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'OAuth rotation' })
        .returning('organization_uuid');
    const [user] = await database('users')
        .insert({ first_name: 'OAuth', last_name: 'User' } as never)
        .returning('user_id');
    const clientId = randomUUID();
    await database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Rotation test',
        redirect_uris: ['https://client.example/callback'],
        grants: ['refresh_token'],
        scopes: ['read'],
    });
    const refreshToken = randomUUID();
    const familyUuid = legacy ? null : randomUUID();
    await database('oauth2_refresh_tokens').insert({
        refresh_token: refreshToken,
        family_uuid: familyUuid,
        expires_at: new Date(Date.now() + 86400000),
        scope: ['read'],
        client_id: clientId,
        user_id: user.user_id,
        organization_uuid: organization.organization_uuid,
    });
    const model = new OAuth2Model(database, lightdashConfigMock, {
        get: vi.fn(
            async ({
                featureFlagId,
            }: Parameters<FeatureFlagModel['get']>[0]) => ({
                id: featureFlagId,
                enabled: true,
            }),
        ),
    });
    const service = new OAuthService({
        oauthModel: model,
        userModel: {} as UserModel,
        lightdashConfig: lightdashConfigMock,
    });
    vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    const refresh = (token: string = refreshToken) =>
        service.token(
            new OAuth2Server.Request({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'transfer-encoding': 'chunked',
                },
                query: {},
                body: {
                    client_id: clientId,
                    grant_type: 'refresh_token',
                    refresh_token: token,
                },
            }),
            new OAuth2Server.Response({}),
        );
    return { model, refresh, refreshToken, familyUuid, clientId };
};

it.each([false, true])(
    'revokes the real family after concurrent refreshes with legacy=%s',
    async (legacy) => {
        const { model, refresh, refreshToken, clientId } =
            await fixture(legacy);
        const getRefreshToken = model.getRefreshToken.bind(model);
        let readers = 0;
        let release!: () => void;
        const bothRead = new Promise<void>((resolve) => {
            release = resolve;
        });
        const reads = vi
            .spyOn(model, 'getRefreshToken')
            .mockImplementation(async (token) => {
                const result = await getRefreshToken(token);
                readers += 1;
                if (readers === 2) release();
                await bothRead;
                return result;
            });
        const outcomes = await Promise.allSettled([refresh(), refresh()]);
        reads.mockRestore();
        expect(
            outcomes.filter((outcome) => outcome.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            outcomes.find((outcome) => outcome.status === 'rejected'),
        ).toMatchObject({ reason: { name: 'invalid_grant' } });
        const rows = await migrated
            .database('oauth2_refresh_tokens')
            .where('client_id', clientId);
        expect(rows).toHaveLength(2);
        expect(rows[0].family_uuid).not.toBeNull();
        expect(
            rows.every(
                (row) =>
                    row.family_uuid === rows[0].family_uuid &&
                    row.revoked_at !== null,
            ),
        ).toBe(true);
        expect(
            await migrated
                .database('oauth2_access_tokens')
                .where('client_id', clientId),
        ).toHaveLength(0);
        await expect(refresh(refreshToken)).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        const successful = outcomes.find(
            (outcome) => outcome.status === 'fulfilled',
        );
        if (successful?.status !== 'fulfilled')
            throw new Error('Expected one successful refresh');
        await expect(
            refresh(successful.value.refreshToken!),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
    },
);

it('serializes family revocation behind an uncommitted rotation', async () => {
    const { model, refresh, clientId } = await fixture(false);
    const { database } = migrated;
    const transaction = database.transaction.bind(database);
    let written!: () => void;
    let commit!: () => void;
    const childWritten = new Promise<void>((resolve) => {
        written = resolve;
    });
    const allowCommit = new Promise<void>((resolve) => {
        commit = resolve;
    });
    let first = true;
    vi.spyOn(database, 'transaction').mockImplementation(((
        callback: (trx: typeof database) => Promise<unknown>,
    ) =>
        transaction(async (trx) => {
            const pause = first;
            first = false;
            const result = await callback(trx);
            if (pause) {
                written();
                await allowCommit;
            }
            return result;
        })) as typeof database.transaction);
    const winner = refresh();
    await childWritten;
    const read = model.getRefreshToken.bind(model);
    let competingRead!: () => void;
    const readDone = new Promise<void>((resolve) => {
        competingRead = resolve;
    });
    vi.spyOn(model, 'getRefreshToken').mockImplementation(async (token) => {
        const result = await read(token);
        competingRead();
        return result;
    });
    const loser = refresh().then(
        (token) => ({ status: 'fulfilled' as const, token }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );
    await readDone;
    commit();
    const issued = await winner;
    expect(await loser).toMatchObject({
        status: 'rejected',
        reason: { name: 'invalid_grant' },
    });
    expect(await model.getAccessToken(issued.accessToken)).toBe(false);
    const rows = await database('oauth2_refresh_tokens').where(
        'client_id',
        clientId,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
});

it('retains expired family evidence through cleanup and revokes descendants on replay', async () => {
    const { model, refresh, refreshToken, familyUuid, clientId } =
        await fixture(false);
    const { database } = migrated;
    const child = await refresh();
    await database('oauth2_refresh_tokens')
        .where('refresh_token', refreshToken)
        .update({
            expires_at: database.raw("now() - interval '1 minute'"),
            revoked_at: database.raw("now() - interval '2 days'"),
        });

    const grandchild = await refresh(child.refreshToken!);
    const ancestor = await database('oauth2_refresh_tokens')
        .where('refresh_token', refreshToken)
        .first();
    expect(ancestor).toMatchObject({ family_uuid: familyUuid });
    expect(ancestor!.expires_at.getTime()).toBeLessThan(Date.now());
    expect(grandchild.refreshTokenExpiresAt!.getTime()).toBeGreaterThan(
        Date.now(),
    );

    await expect(refresh()).rejects.toMatchObject({ name: 'invalid_grant' });
    const familyRows = await database('oauth2_refresh_tokens').where(
        'client_id',
        clientId,
    );
    expect(familyRows).toHaveLength(3);
    expect(familyRows.every((row) => row.revoked_at !== null)).toBe(true);
    expect(await model.getAccessToken(child.accessToken)).toBe(false);
    expect(await model.getAccessToken(grandchild.accessToken)).toBe(false);
    await expect(refresh(child.refreshToken!)).rejects.toMatchObject({
        name: 'invalid_grant',
    });
    await expect(refresh(grandchild.refreshToken!)).rejects.toMatchObject({
        name: 'invalid_grant',
    });
});
