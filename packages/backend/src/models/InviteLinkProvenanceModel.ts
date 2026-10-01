import {
    InviteLink,
    NotFoundError,
    SessionUser,
    TooManyRequestsError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbInviteLinkProvenance,
    InviteLinkProvenanceTableName,
} from '../database/entities/inviteLinkProvenance';
import { InviteLinkModel } from './InviteLinkModel';

export type InviteLinkProvenance = DbInviteLinkProvenance & {
    organizationName: string;
    inviterName: string | null;
    inviterEmail: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class InviteLinkProvenanceModel {
    constructor(private readonly database: Knex) {}

    async upsert(invite: InviteLink, inviter: SessionUser): Promise<void> {
        await this.database(InviteLinkProvenanceTableName)
            .insert({
                invite_code_hash: InviteLinkModel._hash(invite.inviteCode),
                organization_uuid: invite.organizationUuid,
                inviter_user_uuid: inviter.userUuid,
                invitee_email: invite.email,
                expires_at: invite.expiresAt,
            })
            .onConflict('invite_code_hash')
            .merge([
                'organization_uuid',
                'inviter_user_uuid',
                'invitee_email',
                'expires_at',
            ]);
    }

    async findByCode(
        inviteCode: string,
    ): Promise<InviteLinkProvenance | undefined> {
        const row = await this.database(InviteLinkProvenanceTableName)
            .join(
                'organizations',
                'organizations.organization_uuid',
                `${InviteLinkProvenanceTableName}.organization_uuid`,
            )
            .leftJoin(
                'users',
                'users.user_uuid',
                `${InviteLinkProvenanceTableName}.inviter_user_uuid`,
            )
            .leftJoin('emails', function joinPrimaryEmail() {
                this.on('emails.user_id', '=', 'users.user_id').andOnVal(
                    'emails.is_primary',
                    true,
                );
            })
            .where('invite_code_hash', InviteLinkModel._hash(inviteCode))
            .andWhere(
                `${InviteLinkProvenanceTableName}.expires_at`,
                '>',
                new Date(Date.now() - 30 * DAY_MS),
            )
            .select(
                `${InviteLinkProvenanceTableName}.*`,
                'organizations.organization_name as organizationName',
                'users.first_name',
                'users.last_name',
                'emails.email as inviterEmail',
            )
            .first();
        return row
            ? {
                  ...row,
                  inviterName: row.inviter_user_uuid
                      ? [row.first_name, row.last_name]
                            .filter(Boolean)
                            .join(' ') || null
                      : null,
                  inviterEmail: row.inviterEmail ?? null,
              }
            : undefined;
    }

    async requestNew(
        inviteCode: string,
        send: () => Promise<void>,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const row = await trx(InviteLinkProvenanceTableName)
                .where('invite_code_hash', InviteLinkModel._hash(inviteCode))
                .forUpdate()
                .first();
            if (!row || row.expires_at.getTime() <= Date.now() - 30 * DAY_MS) {
                throw new NotFoundError('This invite is no longer available.');
            }
            const now = new Date();
            if (
                row.last_requested_at &&
                row.last_requested_at.getTime() > now.getTime() - DAY_MS
            ) {
                throw new TooManyRequestsError(
                    'A new invite was already requested in the last 24 hours.',
                );
            }
            await send();
            await trx(InviteLinkProvenanceTableName)
                .where('invite_code_hash', row.invite_code_hash)
                .update({ last_requested_at: now });
        });
    }

    async deleteExpired(): Promise<number> {
        return this.database(InviteLinkProvenanceTableName)
            .where('expires_at', '<=', new Date(Date.now() - 30 * DAY_MS))
            .delete();
    }
}
