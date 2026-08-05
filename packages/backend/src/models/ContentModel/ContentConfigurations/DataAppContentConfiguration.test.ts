import { ContentType } from '@lightdash/common';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { dataAppContentConfiguration } from './DataAppContentConfiguration';

const db = knex({ client: MockClient, dialect: 'pg' });

describe('dataAppContentConfiguration.getSummaryQuery', () => {
    it('selects the latest ready version independently from the latest build', () => {
        const { sql } = dataAppContentConfiguration
            .getSummaryQuery(db, {
                contentTypes: [ContentType.DATA_APP],
                projectUuids: ['project-uuid'],
            })
            .toSQL();

        expect(sql).toContain("'latestReadyVersionNumber'");
        expect(sql).toContain("ready_version.status = 'ready'");
        expect(sql).toContain('order by ready_version.version desc');
    });
});
