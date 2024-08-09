import cube, { CubeApi, Query } from '@cubejs-client/core';
import {
    MissingConfigError,
    NotFoundError,
    SemanticLayerClient,
    SemanticLayerQuery,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { cubeTransfomers } from './transformer';

type CubeArgs = {
    lightdashConfig: LightdashConfig;
};

export default class CubeClient implements SemanticLayerClient {
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

    async getFields(
        viewName: string,
        {
            dimensions: selectedDimensions,
            timeDimensions: selectedTimeDimensions,
            metrics: selectedMetrics,
        }: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const cubeMetaApi = await this.cubeApi.meta();
        const views = await this._getCubeViews();
        const view = views.find((v) => v.name === viewName);

        if (view === undefined) {
            throw new NotFoundError(`View ${viewName} not found`);
        }

        const { dimensions: allViewDimensions, measures: allViewMeasures } =
            view;

        if (
            selectedDimensions.length === 0 &&
            selectedTimeDimensions.length === 0 &&
            selectedMetrics.length === 0
        ) {
            // if no fields are selected, return all fields
            return this.transformers.fieldsToSemanticLayerFields(
                allViewDimensions.map((d) => ({ ...d, visible: true })),
                allViewMeasures.map((m) => ({ ...m, visible: true })),
            );
        }

        const availableMetrics = cubeMetaApi.membersForQuery(
            {
                dimensions: selectedDimensions,
                timeDimensions: selectedTimeDimensions.map((d) => ({
                    dimension: d,
                })),
                measures: selectedMetrics,
            },
            'measures',
        );

        const metrics = allViewMeasures.map((m) => ({
            ...m,
            visible: !!availableMetrics.find((am) => am.name === m.name),
        }));

        const availableDimensions = cubeMetaApi.membersForQuery(
            {
                dimensions: selectedDimensions,
                timeDimensions: selectedTimeDimensions.map((d) => ({
                    dimension: d,
                })),
                measures: selectedMetrics,
            },
            'dimensions',
        );

        const dimensions = allViewDimensions.map((d) => ({
            ...d,
            visible: !!availableDimensions.find((ad) => ad.name === d.name),
        }));

        return this.transformers.fieldsToSemanticLayerFields(
            dimensions,
            metrics,
        );
    }

    async getResults(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const resultSet = await this.cubeApi.load(cubeQuery);
        return this.transformers.resultsToResultRows(resultSet);
    }

    async getSql(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const sql = await this.cubeApi.sql(cubeQuery);
        return this.transformers.sqlToString(sql);
    }
}
