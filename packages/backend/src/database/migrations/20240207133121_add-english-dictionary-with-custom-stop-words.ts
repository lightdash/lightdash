import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create custom text search dictionary
    await knex.schema.raw(`
        CREATE TEXT SEARCH DICTIONARY lightdash_english_dict (
            template = snowball,
            language = english
        )
    `);

    // Create a configuration file for stopwords
    await knex.raw(`
        CREATE TEXT SEARCH CONFIGURATION lightdash_english_config (
            copy = english
        )
    `);

    // Add the stopwords to the configuration file
    await knex.raw(`
        ALTER TEXT SEARCH CONFIGURATION lightdash_english_config
            ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part
            WITH lightdash_english_dict
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.raw(`
        DROP TEXT SEARCH CONFIGURATION IF EXISTS lightdash_english_config;
    `);

    await knex.schema.raw(`
        DROP TEXT SEARCH DICTIONARY IF EXISTS lightdash_english_dict;
    `);
}
