import {
    AuthTokenPrefix,
    CreateServiceAccount,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithToken,
    SessionUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import {
    DbServiceAccounts,
    ServiceAccountsTableName,
} from '../database/entities/serviceAccounts';

export class ServiceAccountModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    // Legacy SHA-256 hash (insecure, kept for backwards compatibility)
    static _legacyHash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    // New secure bcrypt hash
    static async _hash(s: string): Promise<string> {
        const saltRounds = 12;
        return bcrypt.hash(s, saltRounds);
    }

    // Verify token against both hash methods for backwards compatibility
    static async _verifyToken(
        token: string,
        storedHash: string,
    ): Promise<boolean> {
        // Try bcrypt first (new method)
        try {
            const isBcryptMatch = await bcrypt.compare(token, storedHash);
            if (isBcryptMatch) return true;
        } catch {
            // If bcrypt fails, it's likely a legacy hash
        }

        // Fallback to legacy SHA-256 hash
        const legacyHash = ServiceAccountModel._legacyHash(token);
        return legacyHash === storedHash;
    }

    static mapDbObjectToServiceAccount(
        data: DbServiceAccounts,
    ): ServiceAccount {
        return {
            uuid: data.service_account_uuid,
            organizationUuid: data.organization_uuid,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
            description: data.description,
            lastUsedAt: data.last_used_at,
            rotatedAt: data.rotated_at,
            createdByUserUuid: data.created_by_user_uuid,
            scopes: data.scopes as ServiceAccountScope[],
        };
    }

    static generateToken(prefix: string = ''): string {
        return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
    }

    async create({
        user,
        data,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        user: SessionUser;
        data: CreateServiceAccount;
        prefix?: string;
    }): Promise<ServiceAccountWithToken> {
        const token = ServiceAccountModel.generateToken(prefix);
        return this.save(user, data, token);
    }

    async save(
        user: SessionUser | undefined,
        data: CreateServiceAccount,
        token: string,
    ): Promise<ServiceAccountWithToken> {
        const tokenHash = await ServiceAccountModel._hash(token);
        const [row] = await this.database('service_accounts')
            .insert({
                created_by_user_uuid: user?.userUuid || null,
                organization_uuid: data.organizationUuid,
                expires_at: data.expiresAt,
                description: data.description,
                token_hash: tokenHash,
                scopes: data.scopes,
            })
            .returning('*');
        if (row === undefined) {
            throw new UnexpectedDatabaseError(
                'Could not create service account token',
            );
        }
        return {
            ...ServiceAccountModel.mapDbObjectToServiceAccount(row),
            token,
        };
    }

    async delete(serviceAccountUuid: string): Promise<void> {
        await this.database('service_accounts')
            .delete()
            .where('service_account_uuid', serviceAccountUuid);
    }

    async updateUsedDate(serviceAccountUuid: string): Promise<void> {
        await this.database(ServiceAccountsTableName)
            .update({
                last_used_at: new Date(),
            })
            .where('service_account_uuid', serviceAccountUuid);
    }

    async rotate({
        serviceAccountUuid,
        rotatedByUserUuid,
        expiresAt,
        prefix = AuthTokenPrefix.SCIM,
    }: {
        serviceAccountUuid: string;
        rotatedByUserUuid: string;
        expiresAt: Date;
        prefix?: string;
    }): Promise<ServiceAccountWithToken> {
        const token = ServiceAccountModel.generateToken(prefix);
        const tokenHash = await ServiceAccountModel._hash(token);

        const [row] = await this.database(ServiceAccountsTableName)
            .update({
                rotated_at: new Date(),
                rotated_by_user_uuid: rotatedByUserUuid,
                expires_at: expiresAt,
                token_hash: tokenHash,
            })
            .where('service_account_uuid', serviceAccountUuid)
            .returning('*');
        return {
            ...ServiceAccountModel.mapDbObjectToServiceAccount(row),
            token,
        };
    }

    async getAllForOrganization(
        organizationUuid: string,
        scopes?: ServiceAccountScope[],
    ): Promise<ServiceAccount[]> {
        const query = this.database('service_accounts')
            .select('*')
            .where('organization_uuid', organizationUuid);
        if (scopes) {
            // scopes <@ ? returns true only if the database's scopes array is a full subset of elements from the provided scopes array
            void query.whereRaw('scopes <@ ?', [scopes]);
        }
        const rows = await query;
        return rows.map(ServiceAccountModel.mapDbObjectToServiceAccount);
    }

    async getTokenbyUuid(
        serviceAccountUuid: string,
    ): Promise<ServiceAccount | undefined> {
        const [row] = await this.database('service_accounts')
            .select('*')
            .where('service_account_uuid', serviceAccountUuid);
        return row && ServiceAccountModel.mapDbObjectToServiceAccount(row);
    }

    async getByToken(token: string): Promise<ServiceAccount> {
        // First try the legacy hash for a quick lookup
        const legacyTokenHash = ServiceAccountModel._legacyHash(token);
        let row = await this.database('service_accounts')
            .select('*')
            .where('token_hash', legacyTokenHash)
            .first();

        // If no legacy hash match, check bcrypt hashes
        if (!row) {
            const bcryptRows = await this.database('service_accounts')
                .select('*')
                .where('token_hash', 'like', '$2%'); // Bcrypt hashes start with $2

            // Find matching token using bcrypt verification
            const verificationPromises = bcryptRows.map(
                async (potentialRow) => {
                    const isValid = await ServiceAccountModel._verifyToken(
                        token,
                        potentialRow.token_hash,
                    );
                    return isValid ? potentialRow : null;
                },
            );

            const results = await Promise.all(verificationPromises);
            row = results.find((result) => result !== null) || undefined;
        }

        if (!row) {
            throw new Error('Service account not found');
        }

        const mappedRow = ServiceAccountModel.mapDbObjectToServiceAccount(row);
        return mappedRow;
    }
}
