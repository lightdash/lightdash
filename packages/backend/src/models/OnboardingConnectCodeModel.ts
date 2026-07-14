import { Knex } from 'knex';
import {
    DbOnboardingConnectCode,
    OnboardingConnectCodeTableName,
} from '../database/entities/onboardingConnectCode';

export type OnboardingConnectCode = {
    projectUuid: string;
    createdByUserUuid: string;
    expiresAt: Date;
    usedAt: Date | null;
};

type OnboardingConnectCodeModelArguments = {
    database: Knex;
};

type CreateOnboardingConnectCode = {
    codeHash: string;
    projectUuid: string;
    createdByUserUuid: string;
    expiresAt: Date;
};

export class OnboardingConnectCodeModel {
    private readonly database: Knex;

    constructor({ database }: OnboardingConnectCodeModelArguments) {
        this.database = database;
    }

    private static convertRow(
        row: DbOnboardingConnectCode,
    ): OnboardingConnectCode {
        return {
            projectUuid: row.project_uuid,
            createdByUserUuid: row.created_by_user_uuid,
            expiresAt: row.expires_at,
            usedAt: row.used_at,
        };
    }

    async create(data: CreateOnboardingConnectCode): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(OnboardingConnectCodeTableName)
                .where('project_uuid', data.projectUuid)
                .whereNull('used_at')
                .delete();
            await trx(OnboardingConnectCodeTableName).insert({
                code_hash: data.codeHash,
                project_uuid: data.projectUuid,
                created_by_user_uuid: data.createdByUserUuid,
                expires_at: data.expiresAt,
            });
        });
    }

    async consume(codeHash: string): Promise<OnboardingConnectCode | null> {
        const [row] = await this.database(OnboardingConnectCodeTableName)
            .where('code_hash', codeHash)
            .whereNull('used_at')
            .where('expires_at', '>', this.database.fn.now())
            .update({ used_at: this.database.fn.now() })
            .returning('*');
        return row ? OnboardingConnectCodeModel.convertRow(row) : null;
    }
}
