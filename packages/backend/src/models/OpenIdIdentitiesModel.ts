import { CreateOpenIdIdentity, OpenIdIdentity } from 'common';
import { Knex } from 'knex';
import { URL } from 'url';
import { DbOpenIdIdentity } from '../database/entities/openIdIdentities';
import { NotExistsError } from '../errors';

type OpenIdIdentityModelDependencies = {
    database: Knex;
};

export class OpenIdIdentityModel {
    private database: Knex;

    constructor(dependencies: OpenIdIdentityModelDependencies) {
        this.database = dependencies.database;
    }

    private static _parseDbIdentity(
        identity: DbOpenIdIdentity,
    ): OpenIdIdentity {
        return {
            issuer: identity.issuer,
            subject: identity.subject,
            createdAt: identity.created_at,
            userId: identity.user_id,
        };
    }

    async getIdentityByOpenId(
        issuer: string,
        subject: string,
    ): Promise<OpenIdIdentity> {
        const [identity] = await this.database('openid_identities')
            .where('issuer', issuer)
            .andWhere('subject', subject)
            .select('*');
        if (identity === undefined) {
            throw new NotExistsError('Cannot find openid identity');
        }
        return OpenIdIdentityModel._parseDbIdentity(identity);
    }

    async getIdentitiesByUserId(userId: number): Promise<OpenIdIdentity[]> {
        const identities = await this.database('openid_identities').where(
            'user_id',
            userId,
        );
        return identities.map(OpenIdIdentityModel._parseDbIdentity);
    }

    async createIdentity(
        createIdentity: CreateOpenIdIdentity,
    ): Promise<OpenIdIdentity> {
        const issuer = new URL('/', createIdentity.issuer).origin; // normalise issuer
        const [identity] = await this.database('openid_identities')
            .insert({
                issuer,
                subject: createIdentity.subject,
                user_id: createIdentity.userId,
            })
            .returning('*');
        return OpenIdIdentityModel._parseDbIdentity(identity);
    }

    async deleteIdentityByOpenId(issuer: string, subject: string) {
        await this.database('openid_identities')
            .where('issuer', issuer)
            .andWhere('subject', subject)
            .delete();
    }
}
