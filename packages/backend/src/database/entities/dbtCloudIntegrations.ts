import { Knex } from 'knex';

type Out = {
    service_token: Buffer;
    metrics_job_id: string;
    project_id: number;
};

type In = Out;
type Update = Pick<In, 'service_token' | 'metrics_job_id'>;

export const DbtCloudIntegrationsTableName = 'dbt_cloud_integrations';
export type DbtCloudIntegrationsTable = Knex.CompositeTableType<
    Out,
    In,
    Update
>;
