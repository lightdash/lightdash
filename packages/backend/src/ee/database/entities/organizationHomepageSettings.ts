import { type HomepageOpening } from '@lightdash/common';
import { type Knex } from 'knex';

export const OrganizationHomepageSettingsTableName =
    'organization_homepage_settings';

export type DbOrganizationHomepageSettings = {
    organization_uuid: string;
    enabled: boolean;
    opening: HomepageOpening | null;
    created_at: Date;
    updated_at: Date;
};

export type OrganizationHomepageSettingsTable = Knex.CompositeTableType<
    DbOrganizationHomepageSettings,
    Pick<
        DbOrganizationHomepageSettings,
        'organization_uuid' | 'enabled' | 'opening'
    >,
    Partial<
        Pick<DbOrganizationHomepageSettings, 'enabled' | 'opening'> &
            Pick<DbOrganizationHomepageSettings, 'updated_at'>
    >
>;
