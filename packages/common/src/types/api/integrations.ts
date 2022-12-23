import {
    DbtCloudIntegration,
    DbtCloudMetadataResponseMetrics,
} from '../dbtCloud';

export type ApiDbtCloudIntegrationSettings = {
    status: 'ok';
    results: DbtCloudIntegration | undefined;
};

export type ApiDbtCloudMetrics = {
    status: 'ok';
    results: DbtCloudMetadataResponseMetrics;
};

export type ApiDbtCloudSettingsDeleteSuccess = {
    status: 'ok';
    results: undefined;
};
