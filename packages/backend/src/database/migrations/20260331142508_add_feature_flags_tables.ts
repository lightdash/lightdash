import { type Knex } from 'knex';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../entities/featureFlags';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable(FeatureFlagsTableName, (table) => {
        table.string('flag_id').primary();
        table.boolean('default_enabled').notNullable().defaultTo(false);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(FeatureFlagOverridesTableName, (table) => {
        table.increments('feature_flag_override_id').primary();
        table
            .string('flag_id')
            .notNullable()
            .references('flag_id')
            .inTable(FeatureFlagsTableName)
            .onDelete('CASCADE');
        table
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .nullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // At least one of user_uuid or organization_uuid must be set
    await knex.raw(`
        ALTER TABLE ${FeatureFlagOverridesTableName}
        ADD CONSTRAINT feature_flag_overrides_target_check
        CHECK (user_uuid IS NOT NULL OR organization_uuid IS NOT NULL)
    `);

    // One override per flag per user
    await knex.raw(`
        CREATE UNIQUE INDEX feature_flag_overrides_user_idx
        ON ${FeatureFlagOverridesTableName} (flag_id, user_uuid)
        WHERE user_uuid IS NOT NULL
    `);

    // One override per flag per org (only org-level, not user-level)
    await knex.raw(`
        CREATE UNIQUE INDEX feature_flag_overrides_org_idx
        ON ${FeatureFlagOverridesTableName} (flag_id, organization_uuid)
        WHERE organization_uuid IS NOT NULL AND user_uuid IS NULL
    `);
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists(FeatureFlagOverridesTableName);
    await knex.schema.dropTableIfExists(FeatureFlagsTableName);
};
