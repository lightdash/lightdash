import {
    MobileSetupCodeError,
    TooManyRequestsError,
    type MobilePlatform,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    MobileSetupCodesTableName,
    type DbMobileSetupCode,
    type DbMobileSetupCodeIn,
} from '../database/entities/mobileSetupCodes';

export class MobileSetupCodeModel {
    constructor(private readonly database: Knex) {}

    async create(code: DbMobileSetupCodeIn): Promise<DbMobileSetupCode> {
        return this.database.transaction(async (transaction) => {
            await transaction('users')
                .where('user_uuid', code.user_uuid)
                .forUpdate()
                .first();
            const { count } = (await transaction(MobileSetupCodesTableName)
                .where('user_uuid', code.user_uuid)
                .where(
                    'created_at',
                    '>',
                    transaction.raw("now() - interval '1 minute'"),
                )
                .count<{ count: string }>('* as count')
                .first()) ?? { count: '0' };
            if (Number(count) >= 10) {
                throw new TooManyRequestsError(
                    'You can create up to 10 mobile setup codes per minute',
                );
            }
            await transaction(MobileSetupCodesTableName)
                .where('user_uuid', code.user_uuid)
                .whereNull('redeemed_at')
                .whereNull('revoked_at')
                .where('expires_at', '>', transaction.fn.now())
                .update({ revoked_at: transaction.fn.now() });
            const [created] = await transaction(MobileSetupCodesTableName)
                .insert(code)
                .returning('*');
            return created;
        });
    }

    async findForUser(
        codeId: string,
        userUuid: string,
    ): Promise<DbMobileSetupCode | undefined> {
        return this.database(MobileSetupCodesTableName)
            .where('mobile_setup_code_uuid', codeId)
            .where('user_uuid', userUuid)
            .first();
    }

    async findByHash(codeHash: string): Promise<DbMobileSetupCode | undefined> {
        return this.database(MobileSetupCodesTableName)
            .where('code_hash', codeHash)
            .first();
    }

    async revoke(codeId: string, userUuid: string): Promise<void> {
        await this.database(MobileSetupCodesTableName)
            .where('mobile_setup_code_uuid', codeId)
            .where('user_uuid', userUuid)
            .whereNull('redeemed_at')
            .whereNull('revoked_at')
            .update({ revoked_at: this.database.fn.now() });
    }

    async beginVerification(
        codeHash: string,
        userUuid: string,
        binding: Pick<
            DbMobileSetupCode,
            | 'verification_challenge'
            | 'verification_client_id'
            | 'verification_platform'
            | 'verification_code_encrypted'
        >,
    ): Promise<DbMobileSetupCode | undefined> {
        return this.database.transaction(async (transaction) => {
            await transaction('users')
                .where('user_uuid', userUuid)
                .forUpdate()
                .first();
            const code = await transaction(MobileSetupCodesTableName)
                .where('code_hash', codeHash)
                .where('user_uuid', userUuid)
                .whereNull('redeemed_at')
                .whereNull('revoked_at')
                .where('expires_at', '>', transaction.fn.now())
                .forUpdate()
                .first();
            if (!code || code.verification_challenge !== null) return code;
            const [bound] = await transaction(MobileSetupCodesTableName)
                .where('mobile_setup_code_uuid', code.mobile_setup_code_uuid)
                .update(binding)
                .returning('*');
            return bound;
        });
    }

    async redeem<T>(
        codeHash: string,
        clientId: string,
        platform: MobilePlatform,
        userUuid: string,
        verify: (code: DbMobileSetupCode) => MobileSetupCodeError | null,
        issueTokens: (transaction: Knex.Transaction) => Promise<T>,
    ): Promise<{ token: T } | { error: MobileSetupCodeError } | undefined> {
        return this.database.transaction(async (transaction) => {
            await transaction('users')
                .where('user_uuid', userUuid)
                .forUpdate()
                .first();
            const code = await transaction(MobileSetupCodesTableName)
                .where('code_hash', codeHash)
                .where('user_uuid', userUuid)
                .whereNull('redeemed_at')
                .whereNull('revoked_at')
                .where('expires_at', '>', transaction.fn.now())
                .forUpdate()
                .first();
            if (code === undefined) return undefined;
            if (code.expires_at.getTime() <= Date.now())
                return { error: MobileSetupCodeError.EXPIRED };
            if (code.verification_attempts >= 5)
                return { error: MobileSetupCodeError.ATTEMPTS_EXHAUSTED };
            const error = verify(code);
            if (error !== null) {
                if (error === MobileSetupCodeError.VERIFICATION_FAILED) {
                    const attempts = code.verification_attempts + 1;
                    await transaction(MobileSetupCodesTableName)
                        .where(
                            'mobile_setup_code_uuid',
                            code.mobile_setup_code_uuid,
                        )
                        .update({
                            verification_attempts: attempts,
                            ...(attempts >= 5
                                ? { revoked_at: transaction.fn.now() }
                                : {}),
                        });
                    if (attempts >= 5)
                        return {
                            error: MobileSetupCodeError.ATTEMPTS_EXHAUSTED,
                        };
                }
                return { error };
            }
            await transaction(MobileSetupCodesTableName)
                .where('mobile_setup_code_uuid', code.mobile_setup_code_uuid)
                .update({
                    redeemed_at: transaction.fn.now(),
                    redeemed_client_id: clientId,
                    redeemed_platform: platform,
                    verification_code_encrypted: null,
                });
            return { token: await issueTokens(transaction) };
        });
    }
}
