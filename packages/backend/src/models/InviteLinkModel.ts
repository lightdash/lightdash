import { InviteLink, NotExistsError } from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { URL } from 'url';
import { lightdashConfig } from '../config/lightdashConfig';
import { DbEmail, EmailTableName } from '../database/entities/emails';
import {
    DbInviteLink,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbUser, UserTableName } from '../database/entities/users';

export class InviteLinkModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDbObjectToInviteLink(
        inviteCode: string,
        data: DbInviteLink & DbOrganization & DbUser & DbEmail,
    ): InviteLink {
        return {
            inviteCode,
            expiresAt: data.expires_at,
            inviteUrl: InviteLinkModel.transformInviteCodeToUrl(inviteCode),
            organisationUuid: data.organization_uuid,
            userUuid: data.user_uuid,
            email: data.email,
        };
    }

    static transformInviteCodeToUrl(code: string): string {
        return new URL(`/invite/${code}`, lightdashConfig.siteUrl).href;
    }

    static _hash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    async deleteByCode(inviteCode: string) {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        await this.database('invite_links')
            .where('invite_code_hash', inviteCodeHash)
            .delete();
    }

    async getByCode(inviteCode: string): Promise<InviteLink> {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        const inviteLinks = await this.database(InviteLinkTableName)
            .leftJoin(
                OrganizationTableName,
                `${InviteLinkTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .leftJoin(
                UserTableName,
                `${InviteLinkTableName}.user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .joinRaw(
                `LEFT JOIN ${EmailTableName} ON ${UserTableName}.user_id = ${EmailTableName}.user_id AND ${EmailTableName}.is_primary`,
            )
            .where('invite_code_hash', inviteCodeHash)
            .select<Array<DbInviteLink & DbOrganization & DbUser & DbEmail>>(
                '*',
            );
        if (inviteLinks.length === 0) {
            throw new NotExistsError('No invite link found');
        }
        return InviteLinkModel.mapDbObjectToInviteLink(
            inviteCode,
            inviteLinks[0],
        );
    }

    async create(
        inviteCode: string,
        expiresAt: Date,
        organizationUuid: string,
        userUuid: string,
    ): Promise<InviteLink> {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }
        const org = orgs[0];
        await this.database('invite_links').insert({
            organization_id: org.organization_id,
            invite_code_hash: inviteCodeHash,
            expires_at: expiresAt,
            user_uuid: userUuid,
        });
        return this.getByCode(inviteCode);
    }

    async deleteByOrganization(organizationUuid: string) {
        const orgs = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('*');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }
        const org = orgs[0];
        await this.database('invite_links')
            .delete()
            .where('organization_id', org.organization_id);
    }
}
