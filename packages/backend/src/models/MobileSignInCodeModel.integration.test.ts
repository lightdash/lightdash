import { MobileSignInCodeStatus } from '@lightdash/common';
import { createHash, randomUUID } from 'crypto';
import { Knex } from 'knex';
import { MobileSignInCodesTableName } from '../database/entities/mobileSignInCodes';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../testing/migratedDatabase';
import { MobileAppLinkModel } from './MobileAppLinkModel';
import {
    mobileSignInCodeChallenge,
    MobileSignInCodeModel,
} from './MobileSignInCodeModel';

const verifier = 'verifier-0000-test-0000-test-0000-test-00000';
const challenge = mobileSignInCodeChallenge(verifier);
const clientId = 'client-0000-test-a';
const otherClientId = 'client-0000-test-b';
const sessionId = 'session-0000-test';

describe('MobileSignInCodeModel (PostgreSQL)', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: MobileSignInCodeModel;
    let userUuid: string;
    let organizationUuid: string;

    const sha256 = (value: string) =>
        createHash('sha256').update(value).digest('hex');

    const row = (code: string) =>
        database(MobileSignInCodesTableName)
            .where('code_hash', sha256(code))
            .first();

    const allowNextRedeem = (code: string) =>
        database(MobileSignInCodesTableName)
            .where('code_hash', sha256(code))
            .update({ last_redeem_attempt_at: null });

    const expire = (code: string) =>
        database(MobileSignInCodesTableName)
            .where('code_hash', sha256(code))
            .update({
                expires_at: database.raw(`NOW() - INTERVAL '1 second'`),
            });

    const mint = (session = sessionId) =>
        model.mint({ userUuid, organizationUuid, sessionId: session });

    const claim = (code: string, client = clientId) =>
        model.claim({
            code,
            clientId: client,
            codeChallenge: challenge,
            platform: 'ios',
        });

    const approve = async (codeUuid: string, nonce: string) =>
        model.decide({
            codeUuid,
            userUuid,
            sessionId,
            nonce,
            decision: 'approved',
        });

    const redeem = async (
        code: string,
        matchNumber: number,
        overrides: Partial<{ clientId: string; codeVerifier: string }> = {},
    ) => {
        await allowNextRedeem(code);
        return model.redeem({
            code,
            clientId,
            codeVerifier: verifier,
            matchNumber,
            ...overrides,
        });
    };

    const decline = async (codeUuid: string, nonce: string) =>
        model.decide({
            codeUuid,
            userUuid,
            sessionId,
            nonce,
            decision: 'declined',
        });

    const probe = async (
        code: string,
        overrides: Partial<{ clientId: string; codeVerifier: string }> = {},
    ) => {
        await allowNextRedeem(code);
        return model.probe({
            code,
            clientId,
            codeVerifier: verifier,
            ...overrides,
        });
    };

    const cancelFromPhone = (
        code: string,
        overrides: Partial<{ clientId: string; codeVerifier: string }> = {},
    ) =>
        model.cancelFromPhone({
            code,
            clientId,
            codeVerifier: verifier,
            ...overrides,
        });

    const stateOf = (codeUuid: string) =>
        model.findForSession({ codeUuid, userUuid, sessionId });

    const claimedAndApproved = async () => {
        const minted = await mint();
        const claimed = await claim(minted.code);
        if (claimed.outcome !== 'claimed') throw new Error('claim failed');
        await approve(minted.codeUuid, minted.approvalNonce);
        return { minted, matchNumber: claimed.row.match_number! };
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 4 });
        database = migrated.database;
        model = new MobileSignInCodeModel({ database });
        const [org] = await database('organizations')
            .insert({ organization_name: `mobile ${randomUUID()}` })
            .returning(['organization_uuid']);
        organizationUuid = org.organization_uuid;
        const [user] = await database('users')
            .insert({
                first_name: 'Test',
                last_name: 'User',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('user_uuid');
        userUuid = user.user_uuid;
        await database('oauth2_clients').insert(
            [clientId, otherClientId].map((id) => ({
                client_id: id,
                client_name: 'Lightdash iOS',
                redirect_uris: ['com.lightdash.mobile://oauth/callback'],
            })),
        );
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(async () => {
        await database(MobileSignInCodesTableName).delete();
    });

    it('stores only hashes and keeps one live code per web session', async () => {
        const first = await mint();
        const second = await mint();
        const other = await mint('session-0000-test-other');

        const rows = await database(MobileSignInCodesTableName).select('*');
        expect(rows).toHaveLength(2);
        expect(await row(first.code)).toBeUndefined();
        const stored = await row(second.code);
        expect(stored?.mobile_sign_in_code_uuid).toBe(second.codeUuid);
        expect(stored?.session_id_hash).toBe(sha256(sessionId));
        expect(JSON.stringify(rows)).not.toContain(second.code);
        expect(JSON.stringify(rows)).not.toContain(second.approvalNonce);
        expect(JSON.stringify(rows)).not.toContain(sessionId);
        expect(await row(other.code)).toBeDefined();
        expect(
            (second.expiresAt.getTime() - Date.now()) / 1000,
        ).toBeGreaterThan(100);
    });

    it('lets exactly one of two racing claims win', async () => {
        const minted = await mint();
        const results = await Promise.all([
            claim(minted.code),
            claim(minted.code, otherClientId),
        ]);
        expect(results.filter((r) => r.outcome === 'claimed')).toHaveLength(1);
        expect(
            results.filter((r) => r.outcome === 'already_used'),
        ).toHaveLength(1);
        const stored = await row(minted.code);
        expect(stored?.match_number).toBeGreaterThanOrEqual(0);
        expect(stored?.match_number).toBeLessThan(100);
    });

    it('refuses to claim an expired, unknown or malformed code', async () => {
        const minted = await mint();
        await expire(minted.code);
        expect(await claim(minted.code)).toEqual({ outcome: 'expired' });
        expect(await claim('A'.repeat(43))).toEqual({ outcome: 'expired' });
        expect(await claim('short')).toEqual({ outcome: 'expired' });
    });

    it('opens a longer window at claim', async () => {
        const minted = await mint();
        const claimed = await claim(minted.code);
        if (claimed.outcome !== 'claimed') throw new Error('claim failed');
        expect(
            (claimed.row.expires_at.getTime() - Date.now()) / 1000,
        ).toBeGreaterThan(280);
    });

    it('approves only from the minting session with the nonce', async () => {
        const minted = await mint();
        await claim(minted.code);

        expect(
            await model.decide({
                codeUuid: minted.codeUuid,
                userUuid,
                sessionId: 'session-0000-test-other',
                nonce: minted.approvalNonce,
                decision: 'approved',
            }),
        ).toEqual({ outcome: 'session_mismatch' });
        expect(await approve(minted.codeUuid, 'wrong-nonce')).toEqual({
            outcome: 'session_mismatch',
        });
        expect(
            await model.decide({
                codeUuid: minted.codeUuid,
                userUuid: randomUUID(),
                sessionId,
                nonce: minted.approvalNonce,
                decision: 'approved',
            }),
        ).toEqual({ outcome: 'not_found' });

        const approved = await approve(minted.codeUuid, minted.approvalNonce);
        expect(approved.outcome).toBe('decided');
        expect(await approve(minted.codeUuid, minted.approvalNonce)).toEqual({
            outcome: 'invalid_state',
            status: MobileSignInCodeStatus.APPROVED,
        });
    });

    it('does not approve a code that has not been claimed', async () => {
        const minted = await mint();
        expect(await approve(minted.codeUuid, minted.approvalNonce)).toEqual({
            outcome: 'invalid_state',
            status: MobileSignInCodeStatus.PENDING,
        });
    });

    it('answers authorization_pending until the web approves, without counting the number', async () => {
        const minted = await mint();
        await claim(minted.code);
        expect(await redeem(minted.code, 0)).toEqual({
            outcome: 'authorization_pending',
        });
        expect((await row(minted.code))?.failed_redeems).toBe(0);
    });

    it('answers slow_down when the phone polls faster than the interval', async () => {
        const minted = await mint();
        await claim(minted.code);
        await redeem(minted.code, 0);
        expect(
            await model.redeem({
                code: minted.code,
                clientId,
                codeVerifier: verifier,
                matchNumber: 0,
            }),
        ).toEqual({ outcome: 'slow_down' });
    });

    it('redeems once with the claiming client, verifier and number', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        const redeemed = await redeem(minted.code, matchNumber);
        expect(redeemed.outcome).toBe('redeemed');
        if (redeemed.outcome === 'redeemed') {
            expect(redeemed.row.user_uuid).toBe(userUuid);
            expect(redeemed.row.organization_uuid).toBe(organizationUuid);
        }
        expect(await redeem(minted.code, matchNumber)).toEqual({
            outcome: 'expired',
        });
        const state = await model.findForSession({
            codeUuid: minted.codeUuid,
            userUuid,
            sessionId,
        });
        expect(state?.effective_status).toBe(MobileSignInCodeStatus.REDEEMED);
    });

    it('lets one of two racing redeems win', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        await allowNextRedeem(minted.code);
        const args = {
            code: minted.code,
            clientId,
            codeVerifier: verifier,
            matchNumber,
        };
        const results = await Promise.all([
            model.redeem(args),
            model.redeem(args),
        ]);
        expect(results.filter((r) => r.outcome === 'redeemed')).toHaveLength(1);
    });

    it('counts a wrong number and declines the code on the third miss', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        const wrong = (matchNumber + 1) % 100;
        expect(await redeem(minted.code, wrong)).toEqual({
            outcome: 'wrong_number',
            declined: null,
        });
        expect(await redeem(minted.code, wrong)).toEqual({
            outcome: 'wrong_number',
            declined: null,
        });
        expect(await redeem(minted.code, wrong)).toEqual({
            outcome: 'wrong_number',
            declined: expect.objectContaining({ user_uuid: userUuid }),
        });
        expect(await redeem(minted.code, matchNumber)).toEqual({
            outcome: 'declined',
        });
        expect((await row(minted.code))?.declined_by).toBe('failed_redeems');
    });

    it('counts a wrong client or verifier as a code mismatch', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        expect(
            await redeem(minted.code, matchNumber, {
                clientId: otherClientId,
            }),
        ).toEqual({ outcome: 'code_mismatch', declined: null });
        expect(
            await redeem(minted.code, matchNumber, {
                codeVerifier: 'another-verifier-0000-test-0000-test-0000',
            }),
        ).toEqual({ outcome: 'code_mismatch', declined: null });
        expect((await row(minted.code))?.failed_redeems).toBe(2);
        expect((await redeem(minted.code, matchNumber)).outcome).toBe(
            'redeemed',
        );
    });

    it('refuses to redeem after the window closes or after a decline', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        await expire(minted.code);
        expect(await redeem(minted.code, matchNumber)).toEqual({
            outcome: 'expired',
        });

        const declinedCode = await mint();
        await claim(declinedCode.code);
        await model.decide({
            codeUuid: declinedCode.codeUuid,
            userUuid,
            sessionId,
            nonce: declinedCode.approvalNonce,
            decision: 'declined',
        });
        expect(await redeem(declinedCode.code, 0)).toEqual({
            outcome: 'declined',
        });
    });

    it('reports expiry on the status read', async () => {
        const minted = await mint();
        await expire(minted.code);
        const state = await model.findForSession({
            codeUuid: minted.codeUuid,
            userUuid,
            sessionId,
        });
        expect(state?.effective_status).toBe(MobileSignInCodeStatus.EXPIRED);
        expect(
            await model.findForSession({
                codeUuid: minted.codeUuid,
                userUuid,
                sessionId: 'session-0000-test-other',
            }),
        ).toBeNull();
    });

    it('deletes unredeemed codes at logout and keeps redeemed ones', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        await redeem(minted.code, matchNumber);
        const pending = await mint('session-0000-test-other');

        expect(await model.deleteUnredeemedForUser(userUuid)).toBe(1);
        expect(await row(pending.code)).toBeUndefined();
        expect(await row(minted.code)).toBeDefined();
        expect(await claim(pending.code)).toEqual({ outcome: 'expired' });
    });

    it('cancels only the session own unredeemed code', async () => {
        const minted = await mint();
        expect(
            await model.deleteForSession({
                codeUuid: minted.codeUuid,
                userUuid,
                sessionId: 'session-0000-test-other',
            }),
        ).toBe(false);
        expect(
            await model.deleteForSession({
                codeUuid: minted.codeUuid,
                userUuid,
                sessionId,
            }),
        ).toBe(true);
    });

    it('cleans up rows an hour after they expire', async () => {
        const fresh = await mint();
        const stale = await mint('session-0000-test-other');
        await database(MobileSignInCodesTableName)
            .where('code_hash', sha256(stale.code))
            .update({ expires_at: database.raw(`NOW() - INTERVAL '2 hours'`) });
        expect(await model.deleteExpired()).toBe(1);
        expect(await row(fresh.code)).toBeDefined();
    });

    it('finds the owner of a code without changing it', async () => {
        const minted = await mint();
        expect(await model.findOwner(minted.code)).toEqual({
            user_uuid: userUuid,
            organization_uuid: organizationUuid,
            reported_platform: null,
        });
        await claim(minted.code);
        expect((await model.findOwner(minted.code))?.reported_platform).toBe(
            'ios',
        );
        expect(await model.findOwner('A'.repeat(43))).toBeNull();
        expect(await model.findOwner('short')).toBeNull();
        expect((await row(minted.code))?.status).toBe('claimed');
    });

    it('lets the web decline after it approved, and records the web as the decliner', async () => {
        const { minted, matchNumber } = await claimedAndApproved();
        expect(
            (await decline(minted.codeUuid, minted.approvalNonce)).outcome,
        ).toBe('decided');
        expect(await row(minted.code)).toMatchObject({
            status: 'declined',
            declined_by: 'web',
        });
        expect(await redeem(minted.code, matchNumber)).toEqual({
            outcome: 'declined',
        });
        expect(await approve(minted.codeUuid, minted.approvalNonce)).toEqual({
            outcome: 'invalid_state',
            status: MobileSignInCodeStatus.DECLINED,
        });
    });

    it('does not approve a code twice', async () => {
        const { minted } = await claimedAndApproved();
        expect(await approve(minted.codeUuid, minted.approvalNonce)).toEqual({
            outcome: 'invalid_state',
            status: MobileSignInCodeStatus.APPROVED,
        });
    });

    it('clears the decliner when the session mints a new code', async () => {
        const minted = await mint();
        await claim(minted.code);
        await decline(minted.codeUuid, minted.approvalNonce);
        await mint();
        expect(
            await database(MobileSignInCodesTableName)
                .where('session_id_hash', sha256(sessionId))
                .first(),
        ).toMatchObject({ status: 'pending', declined_by: null });
    });

    describe('probe without a number', () => {
        it('answers authorization_pending while claimed and match_number_required once approved', async () => {
            const minted = await mint();
            await claim(minted.code);
            expect(await probe(minted.code)).toEqual({
                outcome: 'authorization_pending',
            });
            await approve(minted.codeUuid, minted.approvalNonce);
            expect(await probe(minted.code)).toEqual({
                outcome: 'match_number_required',
            });
            expect(await probe(minted.code)).toEqual({
                outcome: 'match_number_required',
            });
            expect(await row(minted.code)).toMatchObject({
                status: 'approved',
                failed_redeems: 0,
            });
        });

        it('never counts a failed attempt, even with the wrong verifier', async () => {
            const { minted, matchNumber } = await claimedAndApproved();
            for (let attempt = 0; attempt < 4; attempt += 1) {
                // eslint-disable-next-line no-await-in-loop
                const result = await probe(minted.code, {
                    codeVerifier: 'another-verifier-0000-test-0000-test-0000',
                });
                expect(result).toEqual({ outcome: 'code_mismatch' });
            }
            expect(
                await probe(minted.code, { clientId: otherClientId }),
            ).toEqual({ outcome: 'code_mismatch' });
            expect((await row(minted.code))?.failed_redeems).toBe(0);
            expect((await redeem(minted.code, matchNumber)).outcome).toBe(
                'redeemed',
            );
        });

        it('shares the 2 s limiter with redeem', async () => {
            const { minted, matchNumber } = await claimedAndApproved();
            await probe(minted.code);
            expect(
                await model.probe({
                    code: minted.code,
                    clientId,
                    codeVerifier: verifier,
                }),
            ).toEqual({ outcome: 'slow_down' });
            expect(
                await model.redeem({
                    code: minted.code,
                    clientId,
                    codeVerifier: verifier,
                    matchNumber,
                }),
            ).toEqual({ outcome: 'slow_down' });
            expect((await row(minted.code))?.status).toBe('approved');
        });

        it('answers declined and expired like a redeem', async () => {
            const declined = await mint();
            await claim(declined.code);
            await decline(declined.codeUuid, declined.approvalNonce);
            expect(await probe(declined.code)).toEqual({
                outcome: 'declined',
            });

            const expired = await mint('session-0000-test-other');
            await claim(expired.code);
            await expire(expired.code);
            expect(await probe(expired.code)).toEqual({ outcome: 'expired' });
            expect(await probe('A'.repeat(43))).toEqual({
                outcome: 'expired',
            });
        });
    });

    describe('cancel from the phone', () => {
        it('declines a claimed code, records the phone, and answers a repeat the same way', async () => {
            const minted = await mint();
            await claim(minted.code);
            const first = await cancelFromPhone(minted.code);
            expect(first).toMatchObject({
                outcome: 'cancelled',
                isRepeat: false,
            });
            expect(await cancelFromPhone(minted.code)).toMatchObject({
                outcome: 'cancelled',
                isRepeat: true,
            });
            expect(await stateOf(minted.codeUuid)).toMatchObject({
                effective_status: MobileSignInCodeStatus.DECLINED,
                declined_by: 'phone',
            });
            expect(await probe(minted.code)).toEqual({ outcome: 'declined' });
        });

        it('declines an approved code so the number no longer works', async () => {
            const { minted, matchNumber } = await claimedAndApproved();
            expect((await cancelFromPhone(minted.code)).outcome).toBe(
                'cancelled',
            );
            expect(await redeem(minted.code, matchNumber)).toEqual({
                outcome: 'declined',
            });
        });

        it('refuses the wrong verifier or client and leaves the code alone', async () => {
            const { minted } = await claimedAndApproved();
            expect(
                await cancelFromPhone(minted.code, {
                    codeVerifier: 'another-verifier-0000-test-0000-test-0000',
                }),
            ).toEqual({ outcome: 'code_mismatch' });
            expect(
                await cancelFromPhone(minted.code, { clientId: otherClientId }),
            ).toEqual({ outcome: 'code_mismatch' });
            expect(await row(minted.code)).toMatchObject({
                status: 'approved',
                declined_by: null,
                failed_redeems: 0,
            });
        });

        it('refuses a code the web declined, a redeemed, an expired or an unknown code', async () => {
            const webDeclined = await mint();
            await claim(webDeclined.code);
            await decline(webDeclined.codeUuid, webDeclined.approvalNonce);
            expect(await cancelFromPhone(webDeclined.code)).toEqual({
                outcome: 'declined',
            });
            expect((await row(webDeclined.code))?.declined_by).toBe('web');

            await database(MobileSignInCodesTableName).delete();
            const { minted, matchNumber } = await claimedAndApproved();
            await redeem(minted.code, matchNumber);
            expect(await cancelFromPhone(minted.code)).toEqual({
                outcome: 'redeemed',
            });

            const expired = await mint('session-0000-test-other');
            await claim(expired.code);
            await expire(expired.code);
            expect(await cancelFromPhone(expired.code)).toEqual({
                outcome: 'expired',
            });
            expect(await cancelFromPhone('A'.repeat(43))).toEqual({
                outcome: 'expired',
            });
        });

        it('cannot cancel a code no phone has claimed', async () => {
            const minted = await mint();
            expect(await cancelFromPhone(minted.code)).toEqual({
                outcome: 'code_mismatch',
            });
            expect((await row(minted.code))?.status).toBe('pending');
        });
    });

    describe('old clients that send the number on every poll', () => {
        it('answers authorization_pending while claimed, then redeems once the web approves', async () => {
            const minted = await mint();
            const claimed = await claim(minted.code);
            if (claimed.outcome !== 'claimed') throw new Error('claim failed');
            const matchNumber = claimed.row.match_number!;
            for (let poll = 0; poll < 3; poll += 1) {
                // eslint-disable-next-line no-await-in-loop
                expect(await redeem(minted.code, matchNumber)).toEqual({
                    outcome: 'authorization_pending',
                });
            }
            expect((await row(minted.code))?.failed_redeems).toBe(0);
            await approve(minted.codeUuid, minted.approvalNonce);
            expect((await redeem(minted.code, matchNumber)).outcome).toBe(
                'redeemed',
            );
        });

        it('counts a wrong number after the approve toward the 3-try lockout', async () => {
            const minted = await mint();
            const claimed = await claim(minted.code);
            if (claimed.outcome !== 'claimed') throw new Error('claim failed');
            const matchNumber = claimed.row.match_number!;
            const wrong = (matchNumber + 1) % 100;
            expect(await redeem(minted.code, wrong)).toEqual({
                outcome: 'authorization_pending',
            });
            await approve(minted.codeUuid, minted.approvalNonce);
            expect((await redeem(minted.code, wrong)).outcome).toBe(
                'wrong_number',
            );
            expect((await redeem(minted.code, wrong)).outcome).toBe(
                'wrong_number',
            );
            expect(await redeem(minted.code, wrong)).toEqual({
                outcome: 'wrong_number',
                declined: expect.objectContaining({ user_uuid: userUuid }),
            });
            expect(await stateOf(minted.codeUuid)).toMatchObject({
                effective_status: MobileSignInCodeStatus.DECLINED,
                declined_by: 'failed_redeems',
            });
            expect(await redeem(minted.code, matchNumber)).toEqual({
                outcome: 'declined',
            });
        });
    });

    it('reads a rate counter without changing it', async () => {
        const counters = new MobileAppLinkModel({ database });
        const counter = {
            keyHash: 'key-0000-test',
            operation: 'mobile_sign_in.redeem.ip',
            windowStartedAt: new Date('2026-11-09T12:00:00.000Z'),
        };
        expect(await counters.getRateCount(counter)).toBe(0);
        await counters.incrementRateCounter(counter);
        await counters.incrementRateCounter(counter);
        expect(await counters.getRateCount(counter)).toBe(2);
        expect(await counters.getRateCount(counter)).toBe(2);
        expect(
            await counters.getRateCount({ ...counter, keyHash: 'other' }),
        ).toBe(0);
    });
});
