import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

/** Search takes a list of values per field, so "is" and "is not" take several. */
export const PYLON_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const PYLON_SET_FILTERS = [FilterOperator.NULL, FilterOperator.NOT_NULL];

export const PYLON_TEXT_FILTERS = [
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const PYLON_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.LESS_THAN,
];

export const PYLON_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or Pylon's first day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

const dimension = (
    name: string,
    label: string,
    type: DimensionType,
    filterOperators: FilterOperator[],
    description: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    filterOperators,
});

const text = (
    name: string,
    label: string,
    filterOperators: FilterOperator[],
    description: string,
) => dimension(name, label, DimensionType.STRING, filterOperators, description);

const date = (name: string, label: string, description: string) =>
    dimension(name, label, DimensionType.DATE, PYLON_DATE_FILTERS, description);

const metric = (
    name: string,
    label: string,
    description: string,
    aggregation: LiveMetricDefinition['aggregation'],
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation,
});

const count = (noun: string): LiveMetricDefinition =>
    metric(
        'count',
        'Count',
        `How many ${noun} match the filters, counted after reading them from Pylon.`,
        { aggregation: 'additive' },
    );

export const PYLON_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Support issues (conversations and tickets) of one Pylon workspace, read live from issue search. Pylon has no totals, so counts and averages are worked out from the issues read; one query reads at most 9,999 issues, created in the last 30 days unless the Created filter says otherwise. Dates are UTC days.',
    dimensions: [
        dimension(
            'number',
            'Number',
            DimensionType.NUMBER,
            [],
            'The issue number in the workspace.',
        ),
        text(
            'title',
            'Title',
            PYLON_TEXT_FILTERS,
            'The issue title. Filters match part of it.',
        ),
        text('link', 'Link', [], 'Link to the issue in Pylon.'),
        text(
            'state',
            'State',
            PYLON_VALUE_FILTERS,
            'new, waiting_on_you, waiting_on_customer, on_hold, closed, or a custom status slug.',
        ),
        text('type', 'Type', PYLON_VALUE_FILTERS, 'conversation or ticket.'),
        text(
            'source',
            'Source',
            PYLON_VALUE_FILTERS,
            'Where the issue came from, such as slack, email, chat_widget or manual.',
        ),
        text(
            'account_name',
            'Account',
            PYLON_VALUE_FILTERS,
            'Name of the customer account the issue belongs to.',
        ),
        text(
            'account_id',
            'Account ID',
            [...PYLON_VALUE_FILTERS, ...PYLON_SET_FILTERS],
            'Pylon ID of the customer account.',
        ),
        text(
            'assignee_email',
            'Assignee',
            [...PYLON_VALUE_FILTERS, ...PYLON_SET_FILTERS],
            'Email of the teammate assigned to the issue.',
        ),
        text(
            'requester_email',
            'Requester',
            PYLON_VALUE_FILTERS,
            'Email of the customer who raised the issue.',
        ),
        text(
            'team_id',
            'Team ID',
            PYLON_VALUE_FILTERS,
            'Pylon ID of the team the issue is routed to.',
        ),
        text(
            'tags',
            'Tags',
            PYLON_VALUE_FILTERS,
            'The issue tags, comma separated. "Is" keeps issues with any of the tags.',
        ),
        date('created_at', 'Created', 'The day the issue was created, in UTC.'),
        date(
            'updated_at',
            'Updated',
            'The day the issue last changed, in UTC.',
        ),
        date(
            'resolved_at',
            'Resolved',
            'The day the issue was last resolved, in UTC.',
        ),
        dimension(
            'first_response_minutes',
            'First response (minutes)',
            DimensionType.NUMBER,
            [FilterOperator.GREATER_THAN, FilterOperator.LESS_THAN],
            'Minutes from creation to the first reply from the team. Empty before a reply.',
        ),
        dimension(
            'resolution_hours',
            'Resolution time (hours)',
            DimensionType.NUMBER,
            [],
            'Hours from creation to resolution. Empty while open.',
        ),
        dimension(
            'touches',
            'Touches',
            DimensionType.NUMBER,
            PYLON_NUMBER_FILTERS,
            "Pylon's number of touches: replies and actions from the team.",
        ),
        dimension(
            'csat_score',
            'CSAT score',
            DimensionType.NUMBER,
            [],
            'The CSAT score the customer gave, when they answered the survey.',
        ),
    ],
    metrics: [
        count('issues'),
        metric(
            'average_first_response_minutes',
            'Average first response (minutes)',
            'Average minutes to the first team reply, over the issues that have one.',
            { aggregation: 'non_additive' },
        ),
        metric(
            'average_resolution_hours',
            'Average resolution time (hours)',
            'Average hours from creation to resolution, over resolved issues.',
            { aggregation: 'non_additive' },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'created_at', defaultDays: 30 },
    incompatible: [],
};

export const PYLON_ACCOUNTS_EXPLORE: LiveExploreDefinition = {
    name: 'accounts',
    label: 'Accounts',
    description:
        'Customer accounts of one Pylon workspace, read live from account search. Count is worked out from the accounts read; one query reads at most 9,999 accounts.',
    dimensions: [
        text(
            'id',
            'Account ID',
            PYLON_VALUE_FILTERS,
            'Pylon ID of the account.',
        ),
        text(
            'name',
            'Name',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            'The account name.',
        ),
        text(
            'domain',
            'Domain',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            "The account's primary domain.",
        ),
        text(
            'type',
            'Type',
            PYLON_VALUE_FILTERS,
            'The account type, such as customer.',
        ),
        text(
            'owner_email',
            'Owner',
            [],
            'Email of the teammate who owns the account.',
        ),
        text(
            'tags',
            'Tags',
            PYLON_VALUE_FILTERS,
            'The account tags, comma separated. "Is" keeps accounts with any of the tags.',
        ),
        date(
            'created_at',
            'Created',
            'The day the account was created, in UTC.',
        ),
        date(
            'last_customer_activity_at',
            'Last customer activity',
            'The day of the latest message from the customer, in UTC.',
        ),
        date(
            'last_vendor_activity_at',
            'Last team activity',
            'The day of the latest message from the team, in UTC.',
        ),
    ],
    metrics: [count('accounts')],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

export const PYLON_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Customer contacts of one Pylon workspace, read live from contact search. Count is worked out from the contacts read; one query reads at most 9,999 contacts.',
    dimensions: [
        text(
            'id',
            'Contact ID',
            PYLON_VALUE_FILTERS,
            'Pylon ID of the contact.',
        ),
        text(
            'name',
            'Name',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            'The contact name.',
        ),
        text(
            'email',
            'Email',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            'The contact email.',
        ),
        text(
            'account_name',
            'Account',
            PYLON_VALUE_FILTERS,
            'Name of the account the contact belongs to.',
        ),
        text(
            'account_id',
            'Account ID',
            PYLON_VALUE_FILTERS,
            'Pylon ID of the account the contact belongs to.',
        ),
        text(
            'portal_role',
            'Portal role',
            [],
            "The contact's role in the customer portal.",
        ),
    ],
    metrics: [count('contacts')],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
