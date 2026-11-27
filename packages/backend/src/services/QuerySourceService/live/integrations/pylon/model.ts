import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    TimeFrames,
} from '@lightdash/common';
import {
    dimension,
    LIVE_FILTERS,
    type LiveExploreDefinition,
    type LiveModel,
} from '../../sdk';

/** Search takes a list of values per field, so "is" and "is not" take several. */
export const PYLON_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
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

export const PYLON_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Support issues (conversations and tickets) in one Pylon workspace, one row per issue. Dates are in UTC.',
    aiHint: 'Read live from Pylon issue search, one row per issue; a query reads at most 9,999 issues. Without a Created filter the query reads issues created in the last 30 days. There are no metrics: count, sum or average by aggregating rows. Tags "is" keeps issues with any of the tags. Title filters match part of the title. SLA fields are empty when the issue has no SLA.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'created_at', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'number',
            label: 'Number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Issue number in the workspace.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: LIVE_FILTERS.contains,
            description: 'Title of the issue.',
            aiHint: 'Filters match part of the title.',
        }),
        dimension({
            name: 'link',
            label: 'Link',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to the issue in Pylon.',
        }),
        dimension({
            name: 'state',
            label: 'State',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description:
                'Status of the issue: new, waiting_on_you, waiting_on_customer, on_hold, closed, or a custom status.',
        }),
        dimension({
            name: 'type',
            label: 'Type',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Whether the issue is a conversation or a ticket.',
        }),
        dimension({
            name: 'source',
            label: 'Source',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description:
                'Where the issue came from, such as slack, email, chat_widget or manual.',
        }),
        dimension({
            name: 'account_name',
            label: 'Account',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Name of the customer account the issue belongs to.',
        }),
        dimension({
            name: 'account_id',
            label: 'Account ID',
            type: DimensionType.STRING,
            filterOperators: [
                ...PYLON_VALUE_FILTERS,
                ...LIVE_FILTERS.nullChecks,
            ],
            description: 'Pylon ID of the customer account.',
        }),
        dimension({
            name: 'assignee_email',
            label: 'Assignee',
            type: DimensionType.STRING,
            filterOperators: [
                ...PYLON_VALUE_FILTERS,
                ...LIVE_FILTERS.nullChecks,
            ],
            description: 'Email of the teammate assigned to the issue.',
        }),
        dimension({
            name: 'team_id',
            label: 'Team ID',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Pylon ID of the team the issue is routed to.',
        }),
        dimension({
            name: 'tags',
            label: 'Tags',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Tags on the issue, separated by commas.',
            aiHint: '"Is" keeps issues with any of the tags.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day the issue was created, in UTC.',
            aiHint: 'Without a filter the query reads issues created in the last 30 days.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_week',
            label: 'Created week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the issue was created, shown as its Monday, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the weeks.',
            timeInterval: { base: 'created_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'created_at_month',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the issue was created, shown as its first day, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the months.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'updated_at',
            label: 'Updated',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day the issue last changed, in UTC.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'updated_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'updated_at_week',
            label: 'Updated week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the issue was last updated, shown as its Monday, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the weeks.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'updated_at_month',
            label: 'Updated month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the issue was last updated, shown as its first day, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the months.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'resolved_at',
            label: 'Resolved',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day the issue was last resolved, in UTC.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'resolved_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'resolved_at_week',
            label: 'Resolved week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the issue was last resolved, shown as its Monday, in UTC.',
            aiHint: 'Filter Resolved, not this field, to choose the weeks.',
            timeInterval: { base: 'resolved_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'resolved_at_month',
            label: 'Resolved month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the issue was last resolved, shown as its first day, in UTC.',
            aiHint: 'Filter Resolved, not this field, to choose the months.',
            timeInterval: { base: 'resolved_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'first_response_minutes',
            label: 'First response (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: [
                FilterOperator.GREATER_THAN,
                FilterOperator.LESS_THAN,
            ],
            description:
                "Minutes from creation to the team's first reply. Empty until the team replies.",
        }),
        dimension({
            name: 'resolution_hours',
            label: 'Resolution time (hours)',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Hours from creation to resolution. Empty while the issue is open.',
        }),
        dimension({
            name: 'touches',
            label: 'Touches',
            type: DimensionType.NUMBER,
            filterOperators: PYLON_NUMBER_FILTERS,
            description:
                'Number of touches: replies and actions by the team on the issue.',
        }),
        dimension({
            name: 'csat_score',
            label: 'CSAT score',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Satisfaction (CSAT) score the customer gave, if they answered the survey.',
        }),
        dimension({
            name: 'csat_comment',
            label: 'CSAT comment',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Comment the customer left with their CSAT score, if any.',
        }),
        dimension({
            name: 'first_response_due',
            label: 'First response due',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description:
                "Deadline for the first response under the issue's SLA, in UTC. Empty without an SLA.",
        }),
        dimension({
            name: 'first_response_breached',
            label: 'First response breached',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description:
                'Whether the first-response SLA was missed: the first reply came after the deadline, or none has come and the deadline has passed. Empty without an SLA.',
        }),
        dimension({
            name: 'resolution_due',
            label: 'Resolution due',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description:
                "Deadline for resolution under the issue's SLA, in UTC. Empty without an SLA.",
        }),
        dimension({
            name: 'resolution_breached',
            label: 'Resolution breached',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description:
                'Whether the resolution SLA was missed: resolved after the deadline, or still open past it. Empty without an SLA.',
        }),
        dimension({
            name: 'next_reply_due',
            label: 'Next reply due',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description:
                "Deadline for the team's next reply under the issue's SLA, in UTC. Empty when there is none.",
        }),
        dimension({
            name: 'first_resolved_at',
            label: 'First resolved',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Day the issue was first resolved, in UTC.',
            aiHint: 'Resolved is the last resolution; use this for first-time resolution.',
        }),
        dimension({
            name: 'business_first_response_minutes',
            label: 'First response (business minutes)',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Minutes from creation to the team's first reply, counting business hours only. Empty until the team replies.",
        }),
        dimension({
            name: 'business_resolution_hours',
            label: 'Resolution time (business hours)',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Hours from creation to resolution, counting business hours only. Empty while the issue is open.',
        }),
        dimension({
            name: 'created_time',
            label: 'Created time',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'Date and time the issue was created, in UTC.',
            aiHint: 'Filter by Created, not this field.',
        }),
        dimension({
            name: 'priority',
            label: 'Priority',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Priority of the issue, from the workspace\'s "priority" custom field. Empty when the workspace has no such field.',
        }),
        dimension({
            name: 'linked_issue_sources',
            label: 'Linked issue sources',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Where the linked engineering issues live, such as linear or github, separated by commas.',
        }),
        dimension({
            name: 'linked_issue_links',
            label: 'Linked issue links',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Links to the linked engineering issues, separated by commas.',
        }),
    ],
    metrics: [],
};

export const PYLON_ACCOUNTS_EXPLORE: LiveExploreDefinition = {
    name: 'accounts',
    label: 'Accounts',
    description:
        'Customer accounts in one Pylon workspace, one row per account.',
    aiHint: 'Read live from Pylon account search, one row per account; a query reads at most 9,999 accounts. No metrics: count rows to count accounts. Tags "is" keeps accounts with any of the tags. Dates are UTC days.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Account ID',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Pylon ID of the account.',
        }),
        dimension({
            name: 'name',
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [...PYLON_VALUE_FILTERS, ...LIVE_FILTERS.contains],
            description: 'Name of the account.',
        }),
        dimension({
            name: 'domain',
            label: 'Domain',
            type: DimensionType.STRING,
            filterOperators: [...PYLON_VALUE_FILTERS, ...LIVE_FILTERS.contains],
            description: 'Primary domain of the account.',
        }),
        dimension({
            name: 'type',
            label: 'Type',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Account type, such as customer.',
        }),
        dimension({
            name: 'owner_email',
            label: 'Owner',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Email of the teammate who owns the account.',
        }),
        dimension({
            name: 'tags',
            label: 'Tags',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Tags on the account, separated by commas.',
            aiHint: '"Is" keeps accounts with any of the tags.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day the account was created, in UTC.',
        }),
        dimension({
            name: 'last_customer_activity_at',
            label: 'Last customer activity',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day of the latest message from the customer, in UTC.',
        }),
        dimension({
            name: 'last_vendor_activity_at',
            label: 'Last team activity',
            type: DimensionType.DATE,
            filterOperators: PYLON_DATE_FILTERS,
            description: 'Day of the latest message from your team, in UTC.',
        }),
    ],
    metrics: [],
};

export const PYLON_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Customer contacts in one Pylon workspace, one row per contact.',
    aiHint: 'Read live from Pylon contact search, one row per contact; a query reads at most 9,999 contacts. No metrics: count rows to count contacts.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Contact ID',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Pylon ID of the contact.',
        }),
        dimension({
            name: 'name',
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [...PYLON_VALUE_FILTERS, ...LIVE_FILTERS.contains],
            description: 'Name of the contact.',
        }),
        dimension({
            name: 'email',
            label: 'Email',
            type: DimensionType.STRING,
            filterOperators: [...PYLON_VALUE_FILTERS, ...LIVE_FILTERS.contains],
            description: 'Email address of the contact.',
        }),
        dimension({
            name: 'account_name',
            label: 'Account',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Name of the account the contact belongs to.',
        }),
        dimension({
            name: 'account_id',
            label: 'Account ID',
            type: DimensionType.STRING,
            filterOperators: PYLON_VALUE_FILTERS,
            description: 'Pylon ID of the account the contact belongs to.',
        }),
        dimension({
            name: 'portal_role',
            label: 'Portal role',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "Contact's role in the customer portal.",
        }),
    ],
    metrics: [],
};

export const PYLON_EXPLORES = [
    PYLON_ISSUES_EXPLORE,
    PYLON_ACCOUNTS_EXPLORE,
    PYLON_CONTACTS_EXPLORE,
] as const;

export const pylonModel: LiveModel<ApiConnectorType.PYLON> = {
    explores: PYLON_EXPLORES,
    plannedNames: ['messages', 'users', 'teams'],
};
