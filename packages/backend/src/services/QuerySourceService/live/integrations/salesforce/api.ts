import { SALESFORCE_OBJECTS, type SalesforceObject } from '@lightdash/common';

/** Salesforce returns query results in batches of up to 2,000 records. */
export const SALESFORCE_BATCH_SIZE = 2_000;

/** Record lists read at most this many rows: 5 batches with the extra row. */
export const SALESFORCE_MAX_RECORD_ROWS = 9_999;

export const SALESFORCE_MAX_CALLS = Math.ceil(
    (SALESFORCE_MAX_RECORD_ROWS + 1) / SALESFORCE_BATCH_SIZE,
);

/**
 * A query with aggregate functions comes back in one batch: Salesforce
 * refuses it past 2,000 rows (no queryMore), so its LIMIT never goes higher.
 */
export const SALESFORCE_MAX_AGGREGATE_ROWS = 2_000;

/** Each object's explore name, as people say it. */
const EXPLORE_NAMES: Record<SalesforceObject, string> = {
    Opportunity: 'opportunities',
    Account: 'accounts',
    Lead: 'leads',
    Contact: 'contacts',
};

/** The object an explore definition reads. */
export const toSalesforceObject = (
    definitionName: string,
): SalesforceObject => {
    const object = SALESFORCE_OBJECTS.find(
        (candidate) => EXPLORE_NAMES[candidate] === definitionName,
    );
    if (!object) {
        throw new Error(`"${definitionName}" isn't a Salesforce object`);
    }
    return object;
};
