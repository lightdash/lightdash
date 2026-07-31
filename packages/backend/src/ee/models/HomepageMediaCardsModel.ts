import { type HomepageMediaCard } from '@lightdash/common';
import { Knex } from 'knex';
import {
    HomepageMediaCardsTableName,
    type HomepageMediaCardsTable,
} from '../database/entities/homepageMediaCards';

export class HomepageMediaCardsModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async list(): Promise<HomepageMediaCard[]> {
        const rows = await this.database<HomepageMediaCardsTable>(
            HomepageMediaCardsTableName,
        )
            .select('card_key', 'title', 'subtitle', 'url', 'thumbnail_url')
            .orderBy('created_at', 'asc')
            .orderBy('card_key', 'asc');

        return rows.map(
            ({ card_key, title, subtitle, url, thumbnail_url }) => ({
                cardKey: card_key,
                title,
                subtitle,
                url,
                thumbnailUrl: thumbnail_url,
            }),
        );
    }
}
