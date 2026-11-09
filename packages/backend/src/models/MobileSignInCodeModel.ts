import {
    MOBILE_SIGN_IN_CLAIM_TTL_SECONDS,
    MOBILE_SIGN_IN_CODE_TTL_SECONDS,
    MOBILE_SIGN_IN_MAX_FAILED_REDEEMS,
    MOBILE_SIGN_IN_REDEEM_INTERVAL_SECONDS,
    MobileSignInCodeStatus,
} from '@lightdash/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Knex } from 'knex';
import {
    DbMobileSignInCode,
    MobileSignInCodesTableName,
} from '../database/entities/mobileSignInCodes';

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UNREDEEMED_STATUSES = ['pending', 'claimed', 'approved'] as const;
const REDEEM_INTERVAL_TOLERANCE_MS = 500;
const EXPIRED_ROW_RETENTION = "INTERVAL '1 hour'";

const sha256 = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

export const hashMobileSignInSecret = sha256;

export const mobileSignInCodeChallenge = (verifier: string): string =>
    createHash('sha256').update(verifier).digest('base64url');

export const isMobileSignInCode = (value: unknown): value is string =>
    typeof value === 'string' && CODE_PATTERN.test(value);

export type MobileSignInCodeRow = DbMobileSignInCode & {
    effective_status: MobileSignInCodeStatus;
};

export type MintedMobileSignInCode = {
    codeUuid: string;
    code: string;
    approvalNonce: string;
    expiresAt: Date;
};

export type ClaimResult =
    | { outcome: 'claimed'; row: DbMobileSignInCode }
    | { outcome: 'expired' }
    | { outcome: 'already_used' };

export type DecideResult =
    | { outcome: 'decided'; row: DbMobileSignInCode }
    | { outcome: 'not_found' }
    | { outcome: 'session_mismatch' }
    | { outcome: 'invalid_state'; status: MobileSignInCodeStatus };

export type RedeemResult =
    | { outcome: 'redeemed'; row: DbMobileSignInCode }
    | { outcome: 'slow_down' }
    | { outcome: 'authorization_pending' }
    | { outcome: 'declined' }
    | { outcome: 'expired' }
    | { outcome: 'wrong_number'; declined: boolean }
    | { outcome: 'code_mismatch'; declined: boolean };

type MobileSignInCodeModelArguments = {
    database: Knex;
};

export class MobileSignInCodeModel {
    private readonly database: Knex;

    constructor({ database }: MobileSignInCodeModelArguments) {
        this.database = database;
    }

    private secondsFromNow(seconds: number): Knex.Raw {
        return this.database.raw(`NOW() + make_interval(secs => ?)`, [seconds]);
    }

    private static effectiveStatus(
        row: Pick<DbMobileSignInCode, 'status' | 'expires_at'>,
        now: Date,
    ): MobileSignInCodeStatus {
        switch (row.status) {
            case 'declined':
                return MobileSignInCodeStatus.DECLINED;
            case 'redeemed':
                return MobileSignInCodeStatus.REDEEMED;
            case 'pending':
            case 'claimed':
            case 'approved':
                if (row.expires_at.getTime() <= now.getTime()) {
                    return MobileSignInCodeStatus.EXPIRED;
                }
                return {
                    pending: MobileSignInCodeStatus.PENDING,
                    claimed: MobileSignInCodeStatus.CLAIMED,
                    approved: MobileSignInCodeStatus.APPROVED,
                }[row.status];
            default:
                throw new Error(`Unknown mobile sign-in status ${row.status}`);
        }
    }

    private async now(): Promise<Date> {
        const result = await this.database.raw<{ rows: { now: Date }[] }>(
            'SELECT NOW() AS now',
        );
        return result.rows[0].now;
    }

    async mint(args: {
        userUuid: string;
        organizationUuid: string;
        sessionId: string;
    }): Promise<MintedMobileSignInCode> {
        const code = randomBytes(32).toString('base64url');
        const approvalNonce = randomBytes(32).toString('base64url');
        const row = {
            mobile_sign_in_code_uuid: randomUUID(),
            code_hash: sha256(code),
            user_uuid: args.userUuid,
            organization_uuid: args.organizationUuid,
            session_id_hash: sha256(args.sessionId),
            approval_nonce_hash: sha256(approvalNonce),
            expires_at: this.secondsFromNow(MOBILE_SIGN_IN_CODE_TTL_SECONDS),
        };
        const [inserted] = await this.database(MobileSignInCodesTableName)
            .insert(row)
            .onConflict('session_id_hash')
            .merge({
                ...row,
                status: 'pending',
                client_id: null,
                code_challenge: null,
                reported_platform: null,
                match_number: null,
                failed_redeems: 0,
                last_redeem_attempt_at: null,
                created_at: this.database.fn.now(),
                claimed_at: null,
                decided_at: null,
                redeemed_at: null,
            })
            .returning(['mobile_sign_in_code_uuid', 'expires_at']);
        return {
            codeUuid: inserted.mobile_sign_in_code_uuid,
            code,
            approvalNonce,
            expiresAt: inserted.expires_at,
        };
    }

    async findForSession(args: {
        codeUuid: string;
        userUuid: string;
        sessionId: string;
    }): Promise<MobileSignInCodeRow | null> {
        const [row, now] = await Promise.all([
            this.database(MobileSignInCodesTableName)
                .where('mobile_sign_in_code_uuid', args.codeUuid)
                .where('user_uuid', args.userUuid)
                .where('session_id_hash', sha256(args.sessionId))
                .first(),
            this.now(),
        ]);
        if (!row) return null;
        return {
            ...row,
            effective_status: MobileSignInCodeModel.effectiveStatus(row, now),
        };
    }

    async claim(args: {
        code: string;
        clientId: string;
        codeChallenge: string;
        platform: string;
    }): Promise<ClaimResult> {
        if (!isMobileSignInCode(args.code)) return { outcome: 'expired' };
        const codeHash = sha256(args.code);
        const [claimed] = await this.database(MobileSignInCodesTableName)
            .where('code_hash', codeHash)
            .where('status', 'pending')
            .where('expires_at', '>', this.database.fn.now())
            .update({
                status: 'claimed',
                client_id: args.clientId,
                code_challenge: args.codeChallenge,
                reported_platform: args.platform,
                match_number: this.database.raw('floor(random() * 100)::int'),
                claimed_at: this.database.fn.now(),
                expires_at: this.secondsFromNow(
                    MOBILE_SIGN_IN_CLAIM_TTL_SECONDS,
                ),
            })
            .returning('*');
        if (claimed) return { outcome: 'claimed', row: claimed };

        const existing = await this.database(MobileSignInCodesTableName)
            .where('code_hash', codeHash)
            .whereNot('status', 'pending')
            .first('mobile_sign_in_code_uuid');
        return existing ? { outcome: 'already_used' } : { outcome: 'expired' };
    }

    async decide(args: {
        codeUuid: string;
        userUuid: string;
        sessionId: string;
        nonce: string;
        decision: 'approved' | 'declined';
    }): Promise<DecideResult> {
        const [decided] = await this.database(MobileSignInCodesTableName)
            .where('mobile_sign_in_code_uuid', args.codeUuid)
            .where('user_uuid', args.userUuid)
            .where('session_id_hash', sha256(args.sessionId))
            .where('approval_nonce_hash', sha256(args.nonce))
            .where('status', 'claimed')
            .where('expires_at', '>', this.database.fn.now())
            .update({
                status: args.decision,
                decided_at: this.database.fn.now(),
            })
            .returning('*');
        if (decided) return { outcome: 'decided', row: decided };

        const [row, now] = await Promise.all([
            this.database(MobileSignInCodesTableName)
                .where('mobile_sign_in_code_uuid', args.codeUuid)
                .where('user_uuid', args.userUuid)
                .first(),
            this.now(),
        ]);
        if (!row) return { outcome: 'not_found' };
        if (
            row.session_id_hash !== sha256(args.sessionId) ||
            row.approval_nonce_hash !== sha256(args.nonce)
        ) {
            return { outcome: 'session_mismatch' };
        }
        return {
            outcome: 'invalid_state',
            status: MobileSignInCodeModel.effectiveStatus(row, now),
        };
    }

    async redeem(args: {
        code: string;
        clientId: string;
        codeVerifier: string;
        matchNumber: number;
    }): Promise<RedeemResult> {
        if (!isMobileSignInCode(args.code)) return { outcome: 'expired' };
        const codeHash = sha256(args.code);
        const codeChallenge = mobileSignInCodeChallenge(args.codeVerifier);

        const [touched] = await this.database(MobileSignInCodesTableName)
            .where('code_hash', codeHash)
            .whereIn('status', ['claimed', 'approved'])
            .where('expires_at', '>', this.database.fn.now())
            .where((query) =>
                query
                    .whereNull('last_redeem_attempt_at')
                    .orWhereRaw(
                        'last_redeem_attempt_at <= NOW() - make_interval(secs => ?)',
                        [
                            MOBILE_SIGN_IN_REDEEM_INTERVAL_SECONDS -
                                REDEEM_INTERVAL_TOLERANCE_MS / 1000,
                        ],
                    ),
            )
            .update({ last_redeem_attempt_at: this.database.fn.now() })
            .returning(['status', 'client_id', 'code_challenge']);

        if (!touched) {
            const [row, now] = await Promise.all([
                this.database(MobileSignInCodesTableName)
                    .where('code_hash', codeHash)
                    .first(),
                this.now(),
            ]);
            if (!row) return { outcome: 'expired' };
            const status = MobileSignInCodeModel.effectiveStatus(row, now);
            if (status === MobileSignInCodeStatus.DECLINED) {
                return { outcome: 'declined' };
            }
            if (
                status === MobileSignInCodeStatus.CLAIMED ||
                status === MobileSignInCodeStatus.APPROVED
            ) {
                return { outcome: 'slow_down' };
            }
            return { outcome: 'expired' };
        }

        const holdsClaim =
            touched.client_id === args.clientId &&
            touched.code_challenge === codeChallenge;

        if (touched.status === 'claimed') {
            return holdsClaim
                ? { outcome: 'authorization_pending' }
                : { outcome: 'code_mismatch', declined: false };
        }

        const [redeemed] = await this.database(MobileSignInCodesTableName)
            .where('code_hash', codeHash)
            .where('status', 'approved')
            .where('expires_at', '>', this.database.fn.now())
            .where('client_id', args.clientId)
            .where('code_challenge', codeChallenge)
            .where('match_number', args.matchNumber)
            .where('failed_redeems', '<', MOBILE_SIGN_IN_MAX_FAILED_REDEEMS)
            .update({
                status: 'redeemed',
                redeemed_at: this.database.fn.now(),
            })
            .returning('*');
        if (redeemed) return { outcome: 'redeemed', row: redeemed };

        const [failed] = await this.database(MobileSignInCodesTableName)
            .where('code_hash', codeHash)
            .where('status', 'approved')
            .where('expires_at', '>', this.database.fn.now())
            .update({
                failed_redeems: this.database.raw('failed_redeems + 1'),
                status: this.database.raw(
                    `CASE WHEN failed_redeems + 1 >= ? THEN 'declined' ELSE status END`,
                    [MOBILE_SIGN_IN_MAX_FAILED_REDEEMS],
                ),
                decided_at: this.database.raw(
                    `CASE WHEN failed_redeems + 1 >= ? THEN NOW() ELSE decided_at END`,
                    [MOBILE_SIGN_IN_MAX_FAILED_REDEEMS],
                ),
            })
            .returning(['status']);
        if (!failed) return { outcome: 'expired' };
        const declined = failed.status === 'declined';
        return holdsClaim
            ? { outcome: 'wrong_number', declined }
            : { outcome: 'code_mismatch', declined };
    }

    async deleteForSession(args: {
        codeUuid: string;
        userUuid: string;
        sessionId: string;
    }): Promise<boolean> {
        const deleted = await this.database(MobileSignInCodesTableName)
            .where('mobile_sign_in_code_uuid', args.codeUuid)
            .where('user_uuid', args.userUuid)
            .where('session_id_hash', sha256(args.sessionId))
            .whereIn('status', UNREDEEMED_STATUSES)
            .delete();
        return deleted > 0;
    }

    async deleteUnredeemedForUser(userUuid: string): Promise<number> {
        return this.database(MobileSignInCodesTableName)
            .where('user_uuid', userUuid)
            .whereIn('status', UNREDEEMED_STATUSES)
            .delete();
    }

    async deleteExpired(): Promise<number> {
        return this.database(MobileSignInCodesTableName)
            .whereRaw(`expires_at < NOW() - ${EXPIRED_ROW_RETENTION}`)
            .delete();
    }
}
