export type DbtCloudMetric = {
    uniqueId: string;
    name: string;
    dimensions: string[];
    description: string;
    timeGrains: string[];
    label: string;
};

export type DbtCloudMetadataResponseMetrics = {
    metrics: DbtCloudMetric[];
};

export type CreateDbtCloudIntegration = {
    serviceToken: string;
    metricsJobId: string;
};

export type DbtCloudIntegration = Pick<
    CreateDbtCloudIntegration,
    'metricsJobId'
>;
