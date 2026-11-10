import knex from 'knex';
import { describe, expect, test } from 'vitest';
import {
    isComposerChartSelect,
    joinLatestSavedChartVersion,
    latestSavedChartVersionQuery,
} from './latestSavedChartVersion';

const database = knex({ client: 'pg' });

// `SavedChartModel.get` picks a chart's current version by newest `created_at`;
// every "latest version" lookup must agree with it or tile and bulk reads drift.
const LATEST_VERSION_ORDER =
    'where "sqv"."saved_query_id" = "saved_queries"."saved_query_id" order by "sqv"."created_at" desc limit 1';

describe('latest saved chart version lookup', () => {
    test('orders by created_at like SavedChartModel.get', () => {
        expect(
            latestSavedChartVersionQuery(database, ['sqv.pipeline']).toQuery(),
        ).toBe(
            `select "sqv"."pipeline" from "saved_queries_versions" as "sqv" ${LATEST_VERSION_ORDER}`,
        );
    });

    test('the lateral join and the scalar select compile the same lookup', () => {
        const joined = joinLatestSavedChartVersion(
            database('saved_queries'),
            database,
            ['pipeline', 'explore_name'],
            'latest_version',
        ).toQuery();
        expect(joined).toBe(
            `select * from "saved_queries" inner join lateral (select "sqv"."pipeline", "sqv"."explore_name" from "saved_queries_versions" as "sqv" ${LATEST_VERSION_ORDER}) as "latest_version" on true`,
        );

        const scalar = database('saved_queries')
            .select(isComposerChartSelect(database))
            .toQuery();
        expect(scalar).toBe(
            `select (select "sqv"."pipeline" is not null from "saved_queries_versions" as "sqv" ${LATEST_VERSION_ORDER}) as "is_composer_chart" from "saved_queries"`,
        );
    });
});
