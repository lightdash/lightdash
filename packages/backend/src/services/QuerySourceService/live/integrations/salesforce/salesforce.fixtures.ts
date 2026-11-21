/**
 * Response shapes from Salesforce's REST API docs (v62.0): an Opportunity
 * describe trimmed to a field of each kind, and query results. Not from a
 * real org.
 */

const field = (overrides: Record<string, unknown>) => ({
    groupable: true,
    filterable: true,
    sortable: true,
    aggregatable: false,
    calculated: false,
    custom: false,
    deprecatedAndHidden: false,
    inlineHelpText: null,
    relationshipName: null,
    referenceTo: [],
    picklistValues: [],
    ...overrides,
});

export const OPPORTUNITY_DESCRIBE = {
    name: 'Opportunity',
    label: 'Opportunity',
    queryable: true,
    fields: [
        field({ name: 'Id', label: 'Opportunity ID', type: 'id' }),
        field({ name: 'IsDeleted', label: 'Deleted', type: 'boolean' }),
        field({
            name: 'AccountId',
            label: 'Account ID',
            type: 'reference',
            relationshipName: 'Account',
            referenceTo: ['Account'],
        }),
        field({ name: 'Name', label: 'Name', type: 'string' }),
        field({
            name: 'Description',
            label: 'Description',
            type: 'textarea',
            groupable: false,
            filterable: false,
            sortable: false,
        }),
        field({
            name: 'StageName',
            label: 'Stage',
            type: 'picklist',
            picklistValues: [
                { value: 'Prospecting', label: 'Prospecting', active: true },
                { value: 'Closed Won', label: 'Closed Won', active: true },
                { value: 'Closed Lost', label: 'Closed Lost', active: true },
                { value: 'Old Stage', label: 'Old Stage', active: false },
            ],
        }),
        field({
            name: 'Amount',
            label: 'Amount',
            type: 'currency',
            groupable: false,
            aggregatable: true,
        }),
        field({
            name: 'Probability',
            label: 'Probability (%)',
            type: 'percent',
            groupable: false,
            aggregatable: true,
        }),
        field({ name: 'CloseDate', label: 'Close Date', type: 'date' }),
        field({ name: 'IsWon', label: 'Won', type: 'boolean' }),
        field({
            name: 'OwnerId',
            label: 'Owner ID',
            type: 'reference',
            relationshipName: 'Owner',
            referenceTo: ['User'],
        }),
        field({
            name: 'CreatedDate',
            label: 'Created Date',
            type: 'datetime',
            groupable: false,
        }),
        field({
            name: 'LastModifiedDate',
            label: 'Last Modified Date',
            type: 'datetime',
            groupable: false,
        }),
        field({
            name: 'SystemModstamp',
            label: 'System Modstamp',
            type: 'datetime',
            groupable: false,
        }),
        field({
            name: 'Region__c',
            label: 'Region',
            type: 'picklist',
            custom: true,
            inlineHelpText: 'Sales region that owns the deal.',
            picklistValues: [
                { value: 'EMEA', label: 'Europe', active: true },
                { value: 'AMER', label: 'AMER', active: true },
            ],
        }),
        field({
            name: 'Seats__c',
            label: 'Seats',
            type: 'double',
            custom: true,
            groupable: false,
            aggregatable: true,
        }),
        field({
            name: 'Legacy__c',
            label: 'Legacy',
            type: 'string',
            deprecatedAndHidden: true,
        }),
    ],
};

/** An aggregate query's rows: aliased columns, no nextRecordsUrl. */
export const AGGREGATE_RESPONSE = {
    totalSize: 3,
    done: true,
    records: [
        {
            attributes: { type: 'AggregateResult' },
            c0: 'Closed Won',
            c1y: 2026,
            c1m: 3,
            c2: 120000.5,
            c3: 4,
        },
        {
            attributes: { type: 'AggregateResult' },
            c0: 'Prospecting',
            c1y: 2026,
            c1m: 4,
            c2: null,
            c3: 2,
        },
        {
            attributes: { type: 'AggregateResult' },
            c0: null,
            c1y: null,
            c1m: null,
            c2: 10,
            c3: 1,
        },
    ],
};

const record = (index: number) => ({
    attributes: {
        type: 'Opportunity',
        url: `/services/data/v62.0/sobjects/Opportunity/006${index}`,
    },
    Id: `006${String(index).padStart(15, '0')}`,
    Name: `Deal ${index}`,
    Owner: {
        attributes: {
            type: 'User',
            url: '/services/data/v62.0/sobjects/User/005',
        },
        Name: 'Sales Rep',
    },
    CloseDate: '2026-05-17',
    CreatedDate: '2026-02-03T10:15:00.000+0000',
});

/** A batch of a record list; the next one is read from nextRecordsUrl. */
export const recordsBatch = ({
    from,
    count,
    totalSize,
    next,
}: {
    from: number;
    count: number;
    totalSize: number;
    next?: string;
}) => ({
    totalSize,
    done: next === undefined,
    ...(next ? { nextRecordsUrl: next } : {}),
    records: Array.from({ length: count }, (_, index) => record(from + index)),
});

export const LIMITS_RESPONSE = {
    DailyApiRequests: { Max: 15000, Remaining: 14820 },
    ConcurrentAsyncGetReportInstances: { Max: 200, Remaining: 200 },
};

/** Salesforce's error body: a list of { message, errorCode }. */
export const salesforceError = (errorCode: string, message: string) => [
    { message, errorCode },
];
