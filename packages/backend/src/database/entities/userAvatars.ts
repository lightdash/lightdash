import { Knex } from 'knex';

export const UserAvatarsTableName = 'user_avatars';

export type DbUserAvatar = {
    user_uuid: string;
    image: Buffer;
    content_hash: string;
    created_at: Date;
    updated_at: Date;
};

export type DbUserAvatarIn = Pick<
    DbUserAvatar,
    'user_uuid' | 'image' | 'content_hash'
>;

export type DbUserAvatarUpdate = Pick<
    DbUserAvatar,
    'image' | 'content_hash'
> & {
    updated_at: Knex.Raw | Date;
};

export type UserAvatarsTable = Knex.CompositeTableType<
    DbUserAvatar,
    DbUserAvatarIn,
    DbUserAvatarUpdate
>;
