import {
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type DbtVersionOption,
} from '@lightdash/common';

export type ProjectConnectionForm = {
    name: string;
    dbt: DbtProjectConfig;
    warehouse?: CreateWarehouseCredentials;
    dbtVersion: DbtVersionOption;
};

/**
 * BigQueryForm
 * 'warehouse.project' hasNoWhiteSpaces
 * 'warehouse.location' hasNoWhiteSpaces

 * PG
 *  'warehouse.schema' hasNoWhiteSpaces
 *  'warehouse.host' hasNoWhiteSpaces
 *  'warehouse.user' hasNoWhiteSpaces
 * 
 * Databricks
 *  'warehouse.database' hasNoWhiteSpaces
 *  'warehouse.serverHostName' hasNoWhiteSpaces
 *  'warehouse.httpPath' hasNoWhiteSpaces
 *  'warehouse.catalog' hasNoWhiteSpaces
 */
