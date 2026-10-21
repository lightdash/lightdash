import { type Knex } from 'knex';

export const ExploreNameAllocationsTableName = 'explore_name_allocations';

export type DbExploreNameAllocation = {
    explore_name_allocation_uuid: string;
    project_uuid: string;
    name: string;
    source_key: string;
    source_name: string | null;
    package_name: string;
    model_unique_id: string;
    model_name: string;
};

export type ExploreNameAllocationsTable = Knex.CompositeTableType<
    DbExploreNameAllocation,
    Omit<DbExploreNameAllocation, 'explore_name_allocation_uuid'>
>;
