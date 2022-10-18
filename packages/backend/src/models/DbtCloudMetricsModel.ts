import { DbtCloudMetadataResponseMetrics, DbtError } from '@lightdash/common';
import { gql, GraphQLClient } from 'graphql-request';

export class DbtCloudMetricsModel {
    static async getMetrics(
        serviceToken: string,
        jobId: string,
    ): Promise<DbtCloudMetadataResponseMetrics> {
        try {
            const client = new GraphQLClient(
                'https://metadata.cloud.getdbt.com/graphql',
                {
                    headers: {
                        Authorization: `Bearer ${serviceToken}`,
                    },
                },
            );
            const query = gql`
                {
                    metrics(jobId: ${jobId}) {
                        uniqueId
                        name
                        dimensions
                        description
                        timeGrains
                        label
                    }
                }
            `;
            const results = await client.request(query);
            return {
                metrics: results?.metrics || [],
            };
        } catch (e) {
            throw new DbtError(`Error while fetching dbt cloud metadata: ${e}`);
        }
    }
}
