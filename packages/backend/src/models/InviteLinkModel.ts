import { InviteLink } from 'common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { NotExistsError } from '../errors';

export class InviteLinkModel {
    private database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static _hash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    async hasActiveInvites(): Promise<boolean> {
        const invites = await this.database('invite_links').limit(1);
        return invites.length > 0;
    }

    async deleteByCode(inviteCode: string) {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        await this.database('invite_links')
            .where('invite_code_hash', inviteCodeHash)
            .delete();
    }

    async findByCode(inviteCode: string): Promise<InviteLink> {
        const inviteCodeHash = InviteLinkModel._hash(inviteCode);
        const inviteLinks = await this.database('invite_links').where(
            'invite_code_hash',
            inviteCodeHash,
        );
        if (inviteLinks.length === 0) {
            throw new NotExistsError('No invite link found');
        }
        const inviteLink = inviteLinks[0];
        return {
            inviteCode,
            expiresAt: inviteLink.expires_at,
        };
    }

    async create(
        inviteCode: string,
        expiresAt: Date,
        organizationUuid: string,
    ) {
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
        });
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
