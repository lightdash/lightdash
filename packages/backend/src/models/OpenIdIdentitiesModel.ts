import {
    CreateOpenIdIdentity,
    NotExistsError,
    NotFoundError,
    OpenIdIdentity,
    OpenIdIdentityIssuerType,
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
import { DbUser } from '../database/entities/users';

type OpenIdIdentityModelArguments = {
    database: Knex;
};

export class OpenIdIdentityModel {
    private database: Knex;

    constructor(args: OpenIdIdentityModelArguments) {
        this.database = args.database;
    }

    private static _parseDbIdentity(
        identity: DbOpenIdIdentity & Pick<DbUser, 'user_uuid'>,
    ): OpenIdIdentity {
        return {
            issuer: identity.issuer,
            issuerType: identity.issuer_type,
            subject: identity.subject,
            createdAt: identity.created_at,
            userUuid: identity.user_uuid,
            email: identity.email,
        };
    }

    private getOpenIdQueryBuilder() {
        return this.database('openid_identities')
            .leftJoin('users', 'openid_identities.user_id', 'users.user_id')
            .select<Array<DbOpenIdIdentity & Pick<DbUser, 'user_uuid'>>>(
                'openid_identities.issuer',
                'openid_identities.issuer_type',
                'openid_identities.subject',
                'openid_identities.created_at',
                'users.user_uuid',
                'openid_identities.email',
            );
    }

    async findIdentitiesByEmail(email: string): Promise<OpenIdIdentity[]> {
        const identities = await this.getOpenIdQueryBuilder().where(
            'email',
            email,
        );
        return identities.map(OpenIdIdentityModel._parseDbIdentity);
    }

    async getIdentityByOpenId(
        issuer: string,
        subject: string,
    ): Promise<OpenIdIdentity> {
        const [identity] = await this.getOpenIdQueryBuilder()
            .where('issuer', issuer)
            .andWhere('subject', subject);
        if (identity === undefined) {
            throw new NotExistsError('Cannot find openid identity');
        }
        return OpenIdIdentityModel._parseDbIdentity(identity);
    }

    async updateIdentityByOpenId({
        email,
        subject,
        issuer,
        refreshToken,
    }: UpdateOpenIdentity): Promise<OpenIdIdentity> {
        const [identity] = await this.database('openid_identities')
            .update({ email, refresh_token: refreshToken })
            .where('issuer', issuer)
            .andWhere('subject', subject)
            .returning('*');
        if (!identity) {
            throw new NotFoundError(
                'No identity exists with subject and issuer',
            );
        }
        return this.getIdentityByOpenId(identity.issuer, identity.subject);
    }

    async getIdentitiesByUserId(
        userId: number,
    ): Promise<Record<OpenIdIdentityIssuerType, OpenIdIdentitySummary[]>> {
        const identities = await this.getOpenIdQueryBuilder().where(
            'openid_identities.user_id',
            userId,
        );

        const defaultIdentities = Object.values(
            OpenIdIdentityIssuerType,
        ).reduce(
            (acc, curr) => ({ ...acc, [curr]: [] }),
            {} as Record<OpenIdIdentityIssuerType, OpenIdIdentitySummary[]>,
        );

        return identities
            .map(OpenIdIdentityModel._parseDbIdentity)
            .map((id) => ({
                issuerType: id.issuerType,
                issuer: id.issuer,
                email: id.email,
                createdAt: id.createdAt,
            }))
            .reduce<Record<OpenIdIdentityIssuerType, OpenIdIdentitySummary[]>>(
                (acc, curr) => ({
                    ...acc,
                    [curr.issuerType]: [...(acc[curr.issuerType] || []), curr],
                }),
                defaultIdentities,
            );
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
                refresh_token: createIdentity.refreshToken,
            })
            .returning('*');
        return this.getIdentityByOpenId(identity.issuer, identity.subject);
    }

    async deleteIdentity(userId: number, issuer: string, email: string) {
        await this.database.transaction(async (trx) => {
            const identities = await this.database(
                OpenIdIdentitiesTableName,
            ).where('openid_identities.user_id', userId);
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
                .andWhere('openid_identities.user_id', userId)
                .delete();
        });
    }

    async getRefreshToken(userId: number) {
        const [row] = await this.database(OpenIdIdentitiesTableName)
            .where('openid_identities.user_id', userId)
            .select('refresh_token');

        if (!row) {
            throw new NotFoundError('No user found');
        }
        return row.refresh_token;
    }
}
