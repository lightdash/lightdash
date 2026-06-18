import { Knex } from 'knex';

const ExternalConnectionSamplesTableName = 'external_connection_samples';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        ExternalConnectionSamplesTableName,
        (table) => {
            table
                .uuid('sample_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('external_connection_uuid')
                .notNullable()
                .references('external_connection_uuid')
                .inTable('external_connections')
                .onDelete('CASCADE');
            table.text('label').nullable();
            table.jsonb('request').notNullable();
            table.jsonb('response').notNullable();
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.index(
                'external_connection_uuid',
                'external_connection_samples_connection_uuid_idx',
            );
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ExternalConnectionSamplesTableName);
}
