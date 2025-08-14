import type { KnexPaginatedData } from '../knex-paginate';
import type { LightdashProjectParameter } from '../lightdashProjectConfig';
import type { ParameterDefinitions } from '../parameters';

export type ApiGetProjectParametersResults = ParameterDefinitions;

export type ProjectParameterSummary = {
    name: string;
    createdAt: Date;
    config: LightdashProjectParameter;
};

export type ApiGetProjectParametersListResults = KnexPaginatedData<
    ProjectParameterSummary[]
>;
