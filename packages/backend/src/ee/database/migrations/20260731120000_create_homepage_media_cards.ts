import { Knex } from 'knex';

const HomepageMediaCardsTableName = 'homepage_media_cards';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(HomepageMediaCardsTableName, (table) => {
        table
            .uuid('homepage_media_card_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('card_key').notNullable().unique();
        table.text('title').notNullable();
        table.text('subtitle').notNullable();
        table.text('url').notNullable();
        table.text('thumbnail_url').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex(HomepageMediaCardsTableName).insert([
        {
            card_key: 'data-apps-video',
            title: 'What can you build with Lightdash Data Apps? 3 real examples',
            subtitle: 'Oliver shows us how we can build data apps!',
            url: 'https://www.youtube.com/watch?v=BwvgHQyhI1o',
            thumbnail_url: 'https://i.ytimg.com/vi/BwvgHQyhI1o/hqdefault.jpg',
        },
        {
            card_key: 'bi-as-code',
            title: 'BI-as-code',
            subtitle: 'Building content with code',
            url: 'https://www.lightdash.com/bi-as-code',
            thumbnail_url: null,
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(HomepageMediaCardsTableName);
}
