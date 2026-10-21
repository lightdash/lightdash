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
    is_reserved: boolean;
};

export type DbOwnedExploreNameAllocation = DbExploreNameAllocation & {
    is_reserved: false;
};

export const isOwnedExploreNameAllocation = (
    allocation: DbExploreNameAllocation,
): allocation is DbOwnedExploreNameAllocation => !allocation.is_reserved;

export type ExploreNameAllocationsTable = Knex.CompositeTableType<
    DbExploreNameAllocation,
    Omit<
        DbExploreNameAllocation,
        'explore_name_allocation_uuid' | 'is_reserved'
    > & {
        is_reserved?: boolean;
    }
>;
