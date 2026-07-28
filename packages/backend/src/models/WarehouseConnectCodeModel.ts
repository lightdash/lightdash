import { Knex } from 'knex';
import {
    DbWarehouseConnectCode,
    WarehouseConnectCodeTableName,
} from '../database/entities/warehouseConnectCode';

export type WarehouseConnectCodeRecord = {
    organizationUuid: string;
    createdByUserUuid: string;
    expiresAt: Date;
    usedAt: Date | null;
    encryptedCredentials: Buffer | null;
};

type WarehouseConnectCodeModelArguments = {
    database: Knex;
};

type CreateWarehouseConnectCode = {
    codeHash: string;
    organizationUuid: string;
    createdByUserUuid: string;
    expiresAt: Date;
};

export class WarehouseConnectCodeModel {
    private readonly database: Knex;

    constructor({ database }: WarehouseConnectCodeModelArguments) {
        this.database = database;
    }

    private static convertRow(
        row: DbWarehouseConnectCode,
    ): WarehouseConnectCodeRecord {
        return {
            organizationUuid: row.organization_uuid,
            createdByUserUuid: row.created_by_user_uuid,
            expiresAt: row.expires_at,
            usedAt: row.used_at,
            encryptedCredentials: row.encrypted_credentials,
        };
    }

    async create(data: CreateWarehouseConnectCode): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(WarehouseConnectCodeTableName)
                .where('created_by_user_uuid', data.createdByUserUuid)
                .orWhere('expires_at', '<=', this.database.fn.now())
                .delete();
            await trx(WarehouseConnectCodeTableName).insert({
                code_hash: data.codeHash,
                organization_uuid: data.organizationUuid,
                created_by_user_uuid: data.createdByUserUuid,
                expires_at: data.expiresAt,
            });
        });
    }

    async consumeForDeposit(
        codeHash: string,
        encryptedCredentials: Buffer,
    ): Promise<WarehouseConnectCodeRecord | null> {
        const [row] = await this.database(WarehouseConnectCodeTableName)
            .where('code_hash', codeHash)
            .whereNull('used_at')
            .where('expires_at', '>', this.database.fn.now())
            .update({
                used_at: this.database.fn.now(),
                encrypted_credentials: encryptedCredentials,
            })
            .returning('*');
        return row ? WarehouseConnectCodeModel.convertRow(row) : null;
    }

    async findDepositedForClaim(
        codeHash: string,
    ): Promise<WarehouseConnectCodeRecord | null> {
        const row = await this.database(WarehouseConnectCodeTableName)
            .where('code_hash', codeHash)
            .where('expires_at', '>', this.database.fn.now())
            .first();
        return row ? WarehouseConnectCodeModel.convertRow(row) : null;
    }

    async deleteExpired(): Promise<number> {
        return this.database(WarehouseConnectCodeTableName)
            .where('expires_at', '<=', this.database.fn.now())
            .delete();
    }
}
