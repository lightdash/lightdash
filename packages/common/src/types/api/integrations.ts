import { type DbtCloudIntegration } from '../dbtCloud';

export type ApiDbtCloudIntegrationSettings = {
    status: 'ok';
    results: DbtCloudIntegration | undefined;
};

export type ApiDbtCloudSettingsDeleteSuccess = {
    status: 'ok';
    results: undefined;
};
