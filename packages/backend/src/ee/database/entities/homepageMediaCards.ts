import { type HomepageMediaCard, type UUID } from '@lightdash/common';
import { Knex } from 'knex';

export const HomepageMediaCardsTableName = 'homepage_media_cards';

export type DbHomepageMediaCard = {
    homepage_media_card_uuid: UUID;
    card_key: HomepageMediaCard['cardKey'];
    title: HomepageMediaCard['title'];
    subtitle: HomepageMediaCard['subtitle'];
    url: HomepageMediaCard['url'];
    thumbnail_url: HomepageMediaCard['thumbnailUrl'];
    created_at: Date;
    updated_at: Date;
};

export type HomepageMediaCardsTable = Knex.CompositeTableType<
    DbHomepageMediaCard,
    Pick<
        DbHomepageMediaCard,
        'card_key' | 'title' | 'subtitle' | 'url' | 'thumbnail_url'
    >
>;
