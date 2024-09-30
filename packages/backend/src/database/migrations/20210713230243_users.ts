import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    user_id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_uuid uuid NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    first_name text NOT NULL,
    last_name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW(),
    is_marketing_opted_in boolean NOT NULL DEFAULT false,
    is_tracking_anonymized boolean NOT NULL DEFAULT false
);

CREATE EXTENSION IF NOT EXISTS citext; 
CREATE TABLE IF NOT EXISTS emails (
    email_id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id integer NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT NOW(),
    email citext NOT NULL UNIQUE,
    is_primary boolean NOT NULL DEFAULT false 
);

CREATE UNIQUE INDEX IF NOT EXISTS user_id_unique_for_primary_emails_idx ON emails (user_id) WHERE (is_primary);

CREATE TABLE IF NOT EXISTS password_logins (
    user_id integer PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
    organization_id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    organization_uuid uuid NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    organization_name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id integer NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)    
); `);
}
export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
DROP INDEX IF EXISTS user_id_unique_for_primary_emails_idx;
DROP TABLE IF EXISTS 
    organization_memberships, 
    organizations, 
    password_logins,
    emails,
    users CASCADE;
    `);
}
