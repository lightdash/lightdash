export type DbtCloudMetric = {
    uniqueId: string;
    name: string;
    dimensions: string[];
    description: string;
    timeGrains: string[];
    label: string;
};

/**
 * Response from dbt cloud metadata api containing a list of metric definitions
 */
export type DbtCloudMetadataResponseMetrics = {
    /**
     * A list of dbt metric definitions from the dbt cloud metadata api
     */
    metrics: DbtCloudMetric[];
};

/**
 * Credentials required to connect a Lightdash project to dbt Cloud
 */
export type CreateDbtCloudIntegration = {
    /**
     * A service account token for the dbt cloud account. Requires the `metadata:read` scope.
     */
    serviceToken: string;
    /**
     * Job id for a dbt cloud job containing a compiled dbt project with available dbt metrics
     */
    metricsJobId: string;
};

/**
 * Configuration for a Lightdash integration with dbt Cloud
 */
export type DbtCloudIntegration = Pick<
    CreateDbtCloudIntegration,
    'metricsJobId'
>;
