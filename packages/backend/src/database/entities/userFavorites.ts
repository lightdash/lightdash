import { Knex } from 'knex';

export const UserFavoritesTableName = 'user_favorites';

export type DbUserFavorite = {
    user_favorite_uuid: string;
    user_uuid: string;
    project_uuid: string;
    content_type: string;
    content_uuid: string;
    created_at: Date;
};

export type CreateDbUserFavorite = Pick<
    DbUserFavorite,
    'user_uuid' | 'project_uuid' | 'content_type' | 'content_uuid'
>;

export type UserFavoritesTable = Knex.CompositeTableType<
    DbUserFavorite,
    CreateDbUserFavorite
>;
