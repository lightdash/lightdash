import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import {
    usageContentInventoryQuery,
    usageContentTypes,
} from './usageContentInventory';

describe('content inventory snapshot', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const sqlOf = (contentType: (typeof usageContentTypes)[number]) =>
        usageContentInventoryQuery(
            database,
            1,
            'org',
            contentType,
            null,
            100,
            'https://lightdash.example/projects/',
        ).toSQL().sql;

    it("marks the Analytics project's own content, so content tiles can leave it out", () => {
        usageContentTypes.forEach((contentType) =>
            expect(sqlOf(contentType)).toContain(
                "'project_type', CASE WHEN p.provisioning_source = 'analytics' THEN 'ANALYTICS' ELSE p.project_type::text END",
            ),
        );
    });

    it('lists a custom chart type under its own content type, not as a data app', () => {
        expect(sqlOf('data_app')).toContain(
            "CASE WHEN a.template = 'data_app_viz' THEN 'chart_type' ELSE 'data_app' END",
        );
    });
});
