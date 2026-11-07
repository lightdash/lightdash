import type { CreateBigqueryCredentials } from '../types/projects';

const BIGQUERY_WORKLOAD_IDENTITY_PROVIDER_PATTERN =
    /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]{4,32}\/providers\/[a-z0-9-]{4,32}$/;

export const isBigqueryWorkloadIdentityProvider = (value: string) =>
    BIGQUERY_WORKLOAD_IDENTITY_PROVIDER_PATTERN.test(value);

export const isBigqueryWorkloadIdentityAudience = (value: string) =>
    value.length > 0 && value.length <= 256 && !/\s/.test(value);

export const getBigqueryWorkloadIdentityTokenAudience = (
    credentials: Pick<
        CreateBigqueryCredentials,
        'workloadIdentityProvider' | 'workloadIdentityAudience'
    >,
) =>
    credentials.workloadIdentityAudience ??
    `https://iam.googleapis.com/${credentials.workloadIdentityProvider}`;

export const getBigqueryWorkloadIdentityStsAudience = (
    credentials: Pick<CreateBigqueryCredentials, 'workloadIdentityProvider'>,
) => `//iam.googleapis.com/${credentials.workloadIdentityProvider}`;
