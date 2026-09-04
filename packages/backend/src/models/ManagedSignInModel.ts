import { Knex } from 'knex';
import { ManagedSignInTokenUsesTableName } from '../database/entities/managedSignInTokenUses';

export class ManagedSignInModel {
    private readonly database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    /**
     * Records the first use of a Microsoft token. Returns false when the hash
     * is already recorded, which makes this the replay check. The insert is
     * the claim, so two concurrent exchanges of the same token cannot both
     * win.
     */
    async claimTokenUse(tokenHash: string, expiresAt: Date): Promise<boolean> {
        const inserted = await this.database(ManagedSignInTokenUsesTableName)
            .insert({ token_hash: tokenHash, expires_at: expiresAt })
            .onConflict('token_hash')
            .ignore()
            .returning('token_hash');
        return inserted.length > 0;
    }

    /** Rows are only needed for the token's own lifetime. */
    async deleteExpiredTokenUses(): Promise<number> {
        return this.database(ManagedSignInTokenUsesTableName)
            .where('expires_at', '<', this.database.fn.now())
            .del();
    }
}
