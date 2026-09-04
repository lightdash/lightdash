import { Knex } from 'knex';
import { ManagedSignInTokenUsesTableName } from '../database/entities/managedSignInTokenUses';
import Logger from '../logging/logger';

const PRUNE_BATCH_SIZE = 1000;

export class ManagedSignInModel {
    private readonly database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    private async pruneExpiredTokenUses(): Promise<void> {
        try {
            await this.database(ManagedSignInTokenUsesTableName)
                .whereIn('token_hash', (query) =>
                    query
                        .select('token_hash')
                        .from(ManagedSignInTokenUsesTableName)
                        .where('expires_at', '<', this.database.fn.now())
                        .limit(PRUNE_BATCH_SIZE),
                )
                .del();
        } catch (error) {
            Logger.warn('Failed to prune expired managed sign-in token uses', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async claimTokenUse(tokenHash: string, expiresAt: Date): Promise<boolean> {
        await this.pruneExpiredTokenUses();
        const inserted = await this.database(ManagedSignInTokenUsesTableName)
            .insert({ token_hash: tokenHash, expires_at: expiresAt })
            .onConflict('token_hash')
            .ignore()
            .returning('token_hash');
        return inserted.length > 0;
    }
}
