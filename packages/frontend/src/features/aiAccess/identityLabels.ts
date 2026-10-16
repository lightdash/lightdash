import { WarehouseTypes, type AiIdentitySource } from '@lightdash/common';
import i18n from '../../i18n/i18n';

const tr = (key: string) => i18n.t(key, { ns: 'aiAccess' });

const identity = (source: AiIdentitySource, hasShortLabel: boolean) => ({
    get label() {
        return tr(`identity.${source}.label`);
    },
    get description() {
        return tr(`identity.${source}.description`);
    },
    get shortLabel() {
        return hasShortLabel ? tr(`identity.${source}.shortLabel`) : null;
    },
    get tooltip() {
        return tr(`identity.${source}.tooltip`);
    },
});

export const identityLabels: Record<
    AiIdentitySource,
    {
        label: string;
        description: string;
        shortLabel: string | null;
        tooltip: string;
    }
> = {
    marked_person: identity('marked_person', false),
    agent_sign_in: identity('agent_sign_in', true),
    ai_service_account: identity('ai_service_account', true),
};

export const identityChoiceStateLabels = {
    get current() {
        return tr('identity.state.current');
    },
    get settingUp() {
        return tr('identity.state.settingUp');
    },
};

export const identityWarehouseNames = {
    [WarehouseTypes.POSTGRES]: 'Postgres',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.TRINO]: 'Trino',
    [WarehouseTypes.CLICKHOUSE]: 'ClickHouse',
    [WarehouseTypes.ATHENA]: 'Athena',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
};
