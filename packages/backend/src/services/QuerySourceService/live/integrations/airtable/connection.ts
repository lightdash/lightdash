import {
    AIRTABLE_BASE_ID,
    AIRTABLE_ORIGIN,
    AIRTABLE_TABLE_ID,
    ApiConnectorType,
    getAirtableRecordsPath,
    getAirtableTablesPath,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import { readRule, type LiveConnection, type LiveTestSummary } from '../../sdk';
import { readAirtableTables } from './model';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.AIRTABLE];

// The setup test reads the base schema
const testResponseSchema = z.object({ tables: z.array(z.unknown()) });

export const summarizeAirtableTest = (
    body: unknown,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const tables = readAirtableTables(parsed.data.tables);
    return {
        summary:
            tables.length > 0
                ? `Connected to the base: ${tables
                      .slice(0, 3)
                      .map(({ name }) => name)
                      .join(', ')}${tables.length > 3 ? '…' : ''}`
                : 'Connected to the base, which has no tables',
        facts: [{ label: 'Tables', value: String(tables.length) }],
    };
};

export const airtableConnection: LiveConnection<ApiConnectorType.AIRTABLE> = {
    settings: CATALOG.settings,
    origins: [AIRTABLE_ORIGIN],
    // GET only reads. Exact paths keep to the base schema and the tables the
    // source's explores read, never another base.
    access: ({ baseId }, explores) => ({
        rules: [
            readRule('GET', getAirtableTablesPath(baseId), { exact: true }),
            ...explores.flatMap(({ name, apiName }) =>
                apiName && AIRTABLE_TABLE_ID.test(apiName)
                    ? [
                          readRule(
                              'GET',
                              getAirtableRecordsPath(baseId, apiName),
                              { exact: true, entry: name },
                          ),
                      ]
                    : [],
            ),
        ],
    }),
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Airtable live data sources sign in with a personal access token',
            );
        }
    },
    validate: ({ baseId }) => {
        if (!AIRTABLE_BASE_ID.test(baseId)) {
            throw new ParameterError(
                'The Airtable base id starts with app, like appXXXXXXXXXXXXXX',
            );
        }
    },
    describeTarget: ({ settings: { baseId }, targetLabel }) =>
        `Airtable base ${targetLabel ?? baseId}: the records of each of its tables`,
    summarizeTest: summarizeAirtableTest,
};
