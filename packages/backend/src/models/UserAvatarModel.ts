import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import { UserAvatarsTableName } from '../database/entities/userAvatars';

type UserAvatarModelArguments = {
    database: Knex;
};

export class UserAvatarModel {
    private readonly database: Knex;

    constructor({ database }: UserAvatarModelArguments) {
        this.database = database;
    }

    async upsert(
        userUuid: string,
        image: Buffer,
        contentHash: string,
    ): Promise<void> {
        await this.database(UserAvatarsTableName)
            .insert({ user_uuid: userUuid, image, content_hash: contentHash })
            .onConflict('user_uuid')
            .merge({
                image,
                content_hash: contentHash,
                updated_at: this.database.fn.now(),
            });
    }

    // List-safe lookup: never selects the image blob.
    async findContentHash(userUuid: string): Promise<string | undefined> {
        const row = await this.database(UserAvatarsTableName)
            .select('content_hash')
            .where('user_uuid', userUuid)
            .first();
        return row?.content_hash;
    }

    async getImage(userUuid: string, contentHash: string): Promise<Buffer> {
        const row = await this.database(UserAvatarsTableName)
            .select('image')
            .where({ user_uuid: userUuid, content_hash: contentHash })
            .first();
        if (!row) {
            throw new NotFoundError('Avatar not found');
        }
        return row.image;
    }

    async delete(userUuid: string): Promise<void> {
        await this.database(UserAvatarsTableName)
            .where('user_uuid', userUuid)
            .delete();
    }
}
