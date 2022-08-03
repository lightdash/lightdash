import {
    CreateOpenIdIdentity,
    NotExistsError,
    NotFoundError,
    OpenIdIdentity,
    OpenIdIdentitySummary,
    ParameterError,
    UpdateOpenIdentity,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOpenIdIdentity,
    OpenIdIdentitiesTableName,
} from '../database/entities/openIdIdentities';
import { PasswordLoginTableName } from '../database/entities/passwordLogins';

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
            issuerType: identity.issuer_type,
            subject: identity.subject,
            createdAt: identity.created_at,
            userId: identity.user_id,
            email: identity.email,
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

    async updateIdentityByOpenId({
        email,
        subject,
        issuer,
    }: UpdateOpenIdentity): Promise<OpenIdIdentity> {
        const [identity] = await this.database('openid_identities')
            .update({ email })
            .where('issuer', issuer)
            .andWhere('subject', subject)
            .returning('*');
        if (!identity) {
            throw new NotFoundError(
                'No identity exists with subject and issuer',
            );
        }
        return OpenIdIdentityModel._parseDbIdentity(identity);
    }

    async getIdentitiesByUserId(
        userId: number,
    ): Promise<OpenIdIdentitySummary[]> {
        const identities = await this.database('openid_identities').where(
            'user_id',
            userId,
        );
        return identities
            .map(OpenIdIdentityModel._parseDbIdentity)
            .map((id) => ({
                issuerType: id.issuerType,
                issuer: id.issuer,
                email: id.email,
                createdAt: id.createdAt,
            }));
    }

    async createIdentity(
        createIdentity: CreateOpenIdIdentity,
    ): Promise<OpenIdIdentity> {
        const { issuer } = createIdentity;
        const [identity] = await this.database('openid_identities')
            .insert({
                issuer,
                issuer_type: createIdentity.issuerType,
                subject: createIdentity.subject,
                user_id: createIdentity.userId,
                email: createIdentity.email,
            })
            .returning('*');
        return OpenIdIdentityModel._parseDbIdentity(identity);
    }

    async deleteIdentity(userId: number, issuer: string, email: string) {
        await this.database.transaction(async (trx) => {
            const identities = await this.database(
                OpenIdIdentitiesTableName,
            ).where('user_id', userId);
            const passwords = await this.database(PasswordLoginTableName).where(
                'user_id',
                userId,
            );

            const loginOptionsCount = identities.length + passwords.length;

            if (loginOptionsCount <= 1) {
                throw new ParameterError(
                    'Can not remove last login option. Please add another way to login into your account before deleting this one.',
                );
            }

            await trx(OpenIdIdentitiesTableName)
                .where('issuer', issuer)
                .andWhere('email', email)
                .andWhere('user_id', userId)
                .delete();
        });
    }
}
