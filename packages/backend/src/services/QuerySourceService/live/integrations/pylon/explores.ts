import { DimensionType, FilterOperator, TimeFrames } from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
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

/**
 * A date of an issue with its week and month, worked out per issue from the
 * day. The grains take no filters of their own: the day filters them.
 */
const withGrains = (
    name: string,
    label: string,
    description: string,
): LiveDimensionDefinition[] => [
    {
        ...date(name, label, description),
        // The day is its own grain, grouped with the coarser ones
        timeInterval: { base: name, grain: TimeFrames.DAY },
    },
    {
        ...dimension(
            `${name}_week`,
            `${label} week`,
            DimensionType.DATE,
            [],
            `Monday of the week, in UTC. Filter ${label} to choose the weeks.`,
        ),
        timeInterval: { base: name, grain: TimeFrames.WEEK },
    },
    {
        ...dimension(
            `${name}_month`,
            `${label} month`,
            DimensionType.DATE,
            [],
            `First day of the month, in UTC. Filter ${label} to choose the months.`,
        ),
        timeInterval: { base: name, grain: TimeFrames.MONTH },
    },
];

export const PYLON_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Support issues (conversations and tickets) of one Pylon workspace, read live from issue search, one row per issue. One query reads at most 9,999 issues, created in the last 30 days unless the Created filter says otherwise. Dates are UTC days.',
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
        ...withGrains(
            'created_at',
            'Created',
            'The day the issue was created, in UTC.',
        ),
        ...withGrains(
            'updated_at',
            'Updated',
            'The day the issue last changed, in UTC.',
        ),
        ...withGrains(
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
        dimension(
            'csat_comment',
            'CSAT comment',
            DimensionType.STRING,
            [],
            'What the customer wrote with their CSAT score, when they wrote anything.',
        ),
        dimension(
            'first_response_due',
            'First response due',
            DimensionType.TIMESTAMP,
            [],
            "The issue's first response SLA deadline, in UTC. Empty without an SLA.",
        ),
        dimension(
            'first_response_breached',
            'First response breached',
            DimensionType.BOOLEAN,
            [],
            'Whether the first reply came after its SLA deadline, or there is none yet and the deadline has passed. Empty without an SLA.',
        ),
        dimension(
            'resolution_due',
            'Resolution due',
            DimensionType.TIMESTAMP,
            [],
            "The issue's resolution SLA deadline, in UTC. Empty without an SLA.",
        ),
        dimension(
            'resolution_breached',
            'Resolution breached',
            DimensionType.BOOLEAN,
            [],
            'Whether the issue was resolved after its SLA deadline, or is still open and the deadline has passed. Empty without an SLA.',
        ),
        dimension(
            'next_reply_due',
            'Next reply due',
            DimensionType.TIMESTAMP,
            [],
            "The issue's next reply SLA deadline, in UTC. Empty without one.",
        ),
        dimension(
            'first_resolved_at',
            'First resolved',
            DimensionType.DATE,
            [],
            'The day the issue was first resolved, in UTC; Resolved is the last time.',
        ),
        dimension(
            'business_first_response_minutes',
            'First response (business minutes)',
            DimensionType.NUMBER,
            [],
            'Business-hours minutes from creation to the first reply from the team. Empty before a reply.',
        ),
        dimension(
            'business_resolution_hours',
            'Resolution time (business hours)',
            DimensionType.NUMBER,
            [],
            'Business hours from creation to resolution. Empty while open.',
        ),
        dimension(
            'created_time',
            'Created time',
            DimensionType.TIMESTAMP,
            [],
            'When the issue was created, with the time, in UTC. Filter by Created.',
        ),
        dimension(
            'priority',
            'Priority',
            DimensionType.STRING,
            [],
            'The issue\'s "priority" custom field. Empty when the workspace has none.',
        ),
        dimension(
            'linked_issue_sources',
            'Linked issue sources',
            DimensionType.STRING,
            [],
            'Where the linked engineering issues live, such as linear or github, comma separated.',
        ),
        dimension(
            'linked_issue_links',
            'Linked issue links',
            DimensionType.STRING,
            [],
            'Links to the linked engineering issues, comma separated.',
        ),
    ],
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'created_at', defaultDays: 30 },
    incompatible: [],
};

export const PYLON_ACCOUNTS_EXPLORE: LiveExploreDefinition = {
    name: 'accounts',
    label: 'Accounts',
    description:
        'Customer accounts of one Pylon workspace, read live from account search, one row per account. One query reads at most 9,999 accounts.',
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
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

export const PYLON_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Customer contacts of one Pylon workspace, read live from contact search, one row per contact. One query reads at most 9,999 contacts.',
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
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
