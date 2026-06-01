import { PullRequestProvider, PullRequestSource } from '@lightdash/common';
import { Knex } from 'knex';

export const PullRequestsTableName = 'pull_requests';

export type DbPullRequest = {
    pull_request_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string | null;
    provider: PullRequestProvider;
    source: PullRequestSource;
    owner: string;
    repo: string;
    pr_number: number;
    pr_url: string;
    created_at: Date;
};

export type PullRequestsTable = Knex.CompositeTableType<
    DbPullRequest,
    // insert type
    Pick<
        DbPullRequest,
        | 'organization_uuid'
        | 'project_uuid'
        | 'created_by_user_uuid'
        | 'provider'
        | 'source'
        | 'owner'
        | 'repo'
        | 'pr_number'
        | 'pr_url'
    >
>;
