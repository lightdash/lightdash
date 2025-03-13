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
 * BigQueryForm 'warehouse.project' hasNoWhiteSpaces('Project')
 * 'warehouse.location', {
        validate: {
            hasNoWhiteSpaces: hasNoWhiteSpaces('Location'),
        },
        setValueAs: (value) =>
            value === '' ? undefined : value,
    }
        
 */
