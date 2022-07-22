import { DashboardBasicDetails } from './dashboard';
import { SpaceQuery } from './savedCharts';

export type Space = {
    organizationUuid: string;
    uuid: string;
    name: string;
    queries: SpaceQuery[];
    projectUuid: string;
    dashboards: DashboardBasicDetails[];
};

export type CreateSpace = Pick<Space, 'name'>;

export type UpdateSpace = Pick<Space, 'name'>;
