import cube, { CubeApi, Query } from '@cubejs-client/core';
import { MissingConfigError, NotFoundError } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

type CubeArgs = {
    lightdashConfig: LightdashConfig;
};

export default class CubeClient {
    // eslint-disable-next-line class-methods-use-this
    cubeApi?: CubeApi;

    constructor({ lightdashConfig }: CubeArgs) {
        const { token, domain } = lightdashConfig.cube;
        // In development mode, the token is not required for authorization

        if (domain === undefined) {
            console.warn(
                'Cube token and domain are not set, CubeClient will not be initialized',
            );
            return;
        }

        this.cubeApi = cube(token, { apiUrl: `${domain}/cubejs-api/v1` });
    }

    async getViews() {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const meta = await this.cubeApi.meta();
        console.debug('cubes', meta);
        const views = meta.cubes.filter((c) => c.type === 'view');
        return views;
    }

    async getFields(viewName: string) {
        const views = await this.getViews();
        const view = views.find((v) => v.name === viewName);
        if (view === undefined) {
            throw new NotFoundError(`View ${viewName} not found`);
        }
        console.debug('view.dimensions', view.dimensions);
        console.debug('view.measures', view.measures);

        return [view.dimensions, view.measures];
    }

    async getResults(cubeQuery: Query) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const resultSet: any = await this.cubeApi.load(cubeQuery);
        return resultSet;
    }

    async getSql(query: Query) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const sql = await this.cubeApi.sql(query);
        return sql;
    }
}
