import {
    assertUnreachable,
    BIGQUERY_SERVICE_ACCOUNT_TOKEN_URI,
    BigqueryAuthenticationType,
    CreateWarehouseCredentials,
    getBigqueryKeyfileCredentials,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import {
    ambientIdentityTarget,
    DEFAULT_THREADS,
    envVar,
    envVarReference,
} from './helpers';

export const bigqueryTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.BIGQUERY }
    >,
    policy: DbtTargetPolicy,
): DbtTargetResult => {
    if (
        policy.explicitCredentials &&
        credentials.authenticationType === BigqueryAuthenticationType.ADC
    )
        return ambientIdentityTarget(
            'BigQuery Application Default Credentials',
        );
    const bqResult: Extract<DbtTargetResult, { kind: 'target' }> = {
        kind: 'target',
        target: {
            type: credentials.type,
            project: credentials.project,
            dataset: credentials.dataset,
            threads: DEFAULT_THREADS,
            timeout_seconds: credentials.timeoutSeconds,
            priority: credentials.priority,
            retries: credentials.retries,
            maximum_bytes_billed: credentials.maximumBytesBilled || undefined, // form allows empty string, converting to undefined here
            execution_project: credentials.executionProject,
        },
        environment: {},
    };
    switch (credentials.authenticationType) {
        // for backwards compatibility, handle undefined authenticationType as private key.
        case BigqueryAuthenticationType.PRIVATE_KEY:
        case BigqueryAuthenticationType.SSO:
        case undefined:
            bqResult.target.method = 'service-account-json';
            // Ensure keyfileContents exists and is not null/undefined
            if (
                !credentials.keyfileContents ||
                typeof credentials.keyfileContents !== 'object'
            ) {
                throw new ParameterError(
                    'BigQuery private key/SSO authentication requires keyfileContents to be provided',
                );
            }
            if (
                credentials.authenticationType ===
                    BigqueryAuthenticationType.SSO &&
                !credentials.keyfileContents.client_secret
            ) {
                throw new ParameterError(
                    'BigQuery SSO credentials must be resolved before creating a dbt profile',
                );
            }
            const keyfile = getBigqueryKeyfileCredentials(
                credentials.keyfileContents,
            );
            if (keyfile.private_key !== undefined) {
                keyfile.token_uri = BIGQUERY_SERVICE_ACCOUNT_TOKEN_URI;
            }
            bqResult.target.keyfile_json = Object.fromEntries(
                Object.keys(keyfile).map((key) => [key, envVarReference(key)]),
            );
            bqResult.environment = Object.fromEntries(
                Object.entries(keyfile).map(([key, value]) => [
                    envVar(key),
                    value,
                ]),
            );
            return bqResult;
        case BigqueryAuthenticationType.ADC:
            // With oauth method and no keyfile contents, dbt will use the
            // application default credentials (ADC) to authenticate
            bqResult.target.method = 'oauth';
            return bqResult;
        default:
            const { authenticationType } = credentials;
            return assertUnreachable(
                authenticationType,
                `Incorrect BigQuery profile. Received authenticationType: ${authenticationType}`,
            );
    }
};
