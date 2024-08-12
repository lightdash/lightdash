import cube, { CubeApi, Query } from '@cubejs-client/core';
import {
    MissingConfigError,
    NotFoundError,
    SemanticLayerQuery,
    SemanticLayerResultRow,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { cubeTransfomers } from './transformer';

type CubeArgs = {
    lightdashConfig: LightdashConfig;
};

export default class CubeClient {
    // eslint-disable-next-line class-methods-use-this
    cubeApi?: CubeApi;

    transformers = cubeTransfomers;

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

    private async _getCubeViews() {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const meta = await this.cubeApi.meta();
        return meta.cubes.filter((c) => c.type === 'view');
    }

    async getViews() {
        const views = await this._getCubeViews();
        return this.transformers.viewsToSemanticLayerViews(views);
    }

    async getFields(viewName: string) {
        const views = await this._getCubeViews();
        const view = views.find((v) => v.name === viewName);
        if (view === undefined) {
            throw new NotFoundError(`View ${viewName} not found`);
        }

        return this.transformers.fieldsToSemanticLayerFields(
            view.dimensions,
            view.measures,
        );
    }

    async getResults(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const resultSet = await this.cubeApi.load(cubeQuery);

        return this.transformers.resultsToResultRows(resultSet);
    }

    async streamResults(
        _projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ): Promise<number> {
        let offset = 0;
        const limit = 100;
        let partialResults: SemanticLayerResultRow[] = [];
        do {
            /* eslint-disable-next-line no-await-in-loop */
            partialResults = await this.getResults({
                ...query,
                offset,
                limit,
            });
            callback(partialResults);
            offset += limit;
        } while (partialResults.length === limit);
        return offset + partialResults.length;
    }

    async getSql(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const sql = await this.cubeApi.sql(cubeQuery);
        return this.transformers.sqlToString(sql);
    }
}
