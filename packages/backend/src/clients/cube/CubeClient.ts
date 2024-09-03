import cube, { CubeApi, Query } from '@cubejs-client/core';
import {
    getDefaultedLimit,
    MissingConfigError,
    NotFoundError,
    SemanticLayerClient,
    SemanticLayerQuery,
    SemanticLayerResultRow,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import {
    cubeTransfomers,
    getCubeTimeDimensionGranularity,
} from './transformer';

type CubeArgs = {
    lightdashConfig: LightdashConfig;
};

export default class CubeClient implements SemanticLayerClient {
    // eslint-disable-next-line class-methods-use-this
    cubeApi?: CubeApi;

    transformers = cubeTransfomers;

    maxQueryLimit: number;

    maxPartialResultsLimit = 100;

    constructor({ lightdashConfig }: CubeArgs) {
        const { token, domain } = lightdashConfig.cube;
        this.maxQueryLimit = lightdashConfig.query.maxLimit;
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
        selectedFields: Pick<
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
            selectedFields.dimensions.length === 0 &&
            selectedFields.timeDimensions.length === 0 &&
            selectedFields.metrics.length === 0
        ) {
            // if no fields are selected, return all fields
            return this.transformers.fieldsToSemanticLayerFields(
                allViewDimensions.map((d) => ({ ...d, visible: true })),
                allViewMeasures.map((m) => ({ ...m, visible: true })),
            );
        }

        const cubeQueryObject: Query = {
            dimensions: selectedFields.dimensions.map((d) => d.name),
            timeDimensions: selectedFields.timeDimensions.map((td) => ({
                dimension: td.name,
                granularity:
                    td.granularity &&
                    getCubeTimeDimensionGranularity(td.granularity),
            })),
            measures: selectedFields.metrics.map((m) => m.name),
        };

        const availableMetrics = cubeMetaApi.membersForQuery(
            cubeQueryObject,
            'measures',
        );

        const metrics = allViewMeasures.map((m) => ({
            ...m,
            visible: !!availableMetrics.find((am) => am.name === m.name),
        }));

        const availableDimensions = cubeMetaApi.membersForQuery(
            cubeQueryObject,
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

    async getResults(query: SemanticLayerQuery, offset = 0) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');

        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);
        const resultSet = await this.cubeApi.load({
            ...cubeQuery,
            offset,
        });

        return this.transformers.resultsToResultRows(resultSet);
    }

    private async *getResultsGenerator(
        query: SemanticLayerQuery,
        {
            offset,
            partialResultsLimit,
        }: {
            offset: number;
            partialResultsLimit?: number;
        },
    ): AsyncGenerator<SemanticLayerResultRow[]> {
        const defaultedLimit = getDefaultedLimit(
            this.maxQueryLimit,
            query.limit,
        );

        // if the query limit is less than the max partial results limit, use the query limit as the partial results limit
        const generatorPartialResultsLimit =
            partialResultsLimit ??
            Math.min(this.maxPartialResultsLimit, defaultedLimit);

        const partialResults = await this.getResults(
            {
                ...query,
                limit: generatorPartialResultsLimit,
            },
            offset,
        );

        const totalResultsFetched = offset + partialResults.length;

        if (!partialResults.length) {
            return;
        }

        yield partialResults;

        if (
            partialResults.length >= generatorPartialResultsLimit &&
            totalResultsFetched < defaultedLimit
        ) {
            yield* this.getResultsGenerator(query, {
                offset: totalResultsFetched,
                partialResultsLimit: Math.min(
                    generatorPartialResultsLimit,
                    defaultedLimit - offset,
                ),
            });
        }
    }

    async streamResults(
        _projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ): Promise<number> {
        let resultsFetched = 0;

        const resultsGenerator = this.getResultsGenerator(query, {
            offset: resultsFetched,
        });

        for await (const partialResults of resultsGenerator) {
            resultsFetched += partialResults.length; // update the total number of results fetched
            callback(partialResults);
        }

        // return the total number of results
        return resultsFetched;
    }

    async getSql(query: SemanticLayerQuery) {
        if (this.cubeApi === undefined)
            throw new MissingConfigError('Cube has not been initialized');
        const cubeQuery = this.transformers.semanticLayerQueryToQuery(query);

        const defaultedLimit = getDefaultedLimit(
            this.maxQueryLimit,
            query.limit,
        );

        const sql = await this.cubeApi.sql({
            ...cubeQuery,
            limit: defaultedLimit,
        });

        return this.transformers.sqlToString(sql);
    }

    getMaxQueryLimit() {
        return this.maxQueryLimit;
    }
}
