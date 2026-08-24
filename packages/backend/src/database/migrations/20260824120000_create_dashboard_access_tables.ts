import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty dashboard access tables without reading or rewriting existing rows',
} as const;

const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.raw(`
        CREATE TABLE dashboard_user_access (
            dashboard_uuid uuid NOT NULL,
            user_uuid uuid NOT NULL,
            space_role text NOT NULL,
            granted_by_user_uuid uuid,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT dashboard_user_access_pk PRIMARY KEY (dashboard_uuid, user_uuid),
            CONSTRAINT dashboard_user_access_dashboard_fk FOREIGN KEY (dashboard_uuid) REFERENCES dashboards (dashboard_uuid) ON DELETE CASCADE,
            CONSTRAINT dashboard_user_access_user_fk FOREIGN KEY (user_uuid) REFERENCES users (user_uuid) ON DELETE CASCADE,
            CONSTRAINT dashboard_user_access_grantor_fk FOREIGN KEY (granted_by_user_uuid) REFERENCES users (user_uuid) ON DELETE SET NULL,
            CONSTRAINT dashboard_user_access_role_chk CHECK (space_role IN ('viewer', 'editor', 'admin'))
        );
        CREATE INDEX dashboard_user_access_principal_idx ON dashboard_user_access (user_uuid, dashboard_uuid);
        CREATE INDEX dashboard_user_access_grantor_idx ON dashboard_user_access (granted_by_user_uuid);

        CREATE TABLE dashboard_group_access (
            dashboard_uuid uuid NOT NULL,
            group_uuid uuid NOT NULL,
            space_role text NOT NULL,
            granted_by_user_uuid uuid,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT dashboard_group_access_pk PRIMARY KEY (dashboard_uuid, group_uuid),
            CONSTRAINT dashboard_group_access_dashboard_fk FOREIGN KEY (dashboard_uuid) REFERENCES dashboards (dashboard_uuid) ON DELETE CASCADE,
            CONSTRAINT dashboard_group_access_group_fk FOREIGN KEY (group_uuid) REFERENCES groups (group_uuid) ON DELETE CASCADE,
            CONSTRAINT dashboard_group_access_grantor_fk FOREIGN KEY (granted_by_user_uuid) REFERENCES users (user_uuid) ON DELETE SET NULL,
            CONSTRAINT dashboard_group_access_role_chk CHECK (space_role IN ('viewer', 'editor', 'admin'))
        );
        CREATE INDEX dashboard_group_access_principal_idx ON dashboard_group_access (group_uuid, dashboard_uuid);
        CREATE INDEX dashboard_group_access_grantor_idx ON dashboard_group_access (granted_by_user_uuid);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.raw(`
        DROP TABLE dashboard_group_access;
        DROP TABLE dashboard_user_access;
    `);
}
