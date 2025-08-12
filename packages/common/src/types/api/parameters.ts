import type { KnexPaginatedData } from '../knex-paginate';
import type { ParameterDefinitions } from '../parameters';

export type ApiGetProjectParametersResults = ParameterDefinitions;

export type ProjectParameterSummary = {
    name: string;
    label: string;
    description?: string;
    default?: string | string[];
    createdAt: Date;
};

export type ApiGetProjectParametersListResults = KnexPaginatedData<
    ProjectParameterSummary[]
>;
