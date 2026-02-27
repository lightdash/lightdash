import {
    ContentType,
    type ContentVerificationInfo,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ContentVerificationTableName,
    type CreateDbContentVerification,
} from '../database/entities/contentVerification';
import { UserTableName } from '../database/entities/users';

type ContentVerificationModelArguments = {
    database: Knex;
};

export class ContentVerificationModel {
    private readonly database: Knex;

    constructor({ database }: ContentVerificationModelArguments) {
        this.database = database;
    }

    async getByContent(
        contentType: ContentType,
        contentUuid: string,
    ): Promise<ContentVerificationInfo | null> {
        const row = await this.database(ContentVerificationTableName)
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where({
                [`${ContentVerificationTableName}.content_type`]: contentType,
                [`${ContentVerificationTableName}.content_uuid`]: contentUuid,
            })
            .select(
                `${ContentVerificationTableName}.verified_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            )
            .first();

        if (!row) return null;

        return {
            verifiedBy: {
                userUuid: row.user_uuid,
                firstName: row.first_name,
                lastName: row.last_name,
            },
            verifiedAt: row.verified_at,
        };
    }

    async getByContentUuids(
        contentType: ContentType,
        contentUuids: string[],
    ): Promise<Map<string, ContentVerificationInfo>> {
        if (contentUuids.length === 0) return new Map();

        const rows = await this.database(ContentVerificationTableName)
            .leftJoin(
                UserTableName,
                `${ContentVerificationTableName}.verified_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where(
                `${ContentVerificationTableName}.content_type`,
                contentType,
            )
            .whereIn(
                `${ContentVerificationTableName}.content_uuid`,
                contentUuids,
            )
            .select(
                `${ContentVerificationTableName}.content_uuid`,
                `${ContentVerificationTableName}.verified_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
            );

        const result = new Map<string, ContentVerificationInfo>();
        for (const row of rows) {
            result.set(row.content_uuid, {
                verifiedBy: {
                    userUuid: row.user_uuid,
                    firstName: row.first_name,
                    lastName: row.last_name,
                },
                verifiedAt: row.verified_at,
            });
        }
        return result;
    }

    async verify(
        contentType: ContentType,
        contentUuid: string,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const data: CreateDbContentVerification = {
            content_type: contentType,
            content_uuid: contentUuid,
            project_uuid: projectUuid,
            verified_by_user_uuid: userUuid,
        };

        await this.database(ContentVerificationTableName)
            .insert(data)
            .onConflict(['content_type', 'content_uuid'])
            .merge({
                verified_by_user_uuid: userUuid,
                verified_at: this.database.fn.now(),
            });
    }

    async unverify(
        contentType: ContentType,
        contentUuid: string,
    ): Promise<void> {
        await this.database(ContentVerificationTableName)
            .where({
                content_type: contentType,
                content_uuid: contentUuid,
            })
            .delete();
    }
}
