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
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators,
});

const text = (
    name: string,
    label: string,
    filterOperators: FilterOperator[],
    description: string,
    aiHint?: string,
) =>
    dimension(
        name,
        label,
        DimensionType.STRING,
        filterOperators,
        description,
        aiHint,
    );

const date = (
    name: string,
    label: string,
    description: string,
    aiHint?: string,
) =>
    dimension(
        name,
        label,
        DimensionType.DATE,
        PYLON_DATE_FILTERS,
        description,
        aiHint,
    );

/**
 * A date of an issue with its week and month, worked out per issue from the
 * day. The grains take no filters of their own: the day filters them.
 */
const withGrains = ({
    name,
    label,
    description,
    happened,
    aiHint,
}: {
    name: string;
    label: string;
    description: string;
    /** What happened to the issue on the day, such as "was created". */
    happened: string;
    aiHint?: string;
}): LiveDimensionDefinition[] => [
    {
        ...date(name, label, description, aiHint),
        // The day is its own grain, grouped with the coarser ones
        timeInterval: { base: name, grain: TimeFrames.DAY },
    },
    {
        ...dimension(
            `${name}_week`,
            `${label} week`,
            DimensionType.DATE,
            [],
            `Week the issue ${happened}, shown as its Monday, in UTC.`,
            `Filter ${label}, not this field, to choose the weeks.`,
        ),
        timeInterval: { base: name, grain: TimeFrames.WEEK },
    },
    {
        ...dimension(
            `${name}_month`,
            `${label} month`,
            DimensionType.DATE,
            [],
            `Month the issue ${happened}, shown as its first day, in UTC.`,
            `Filter ${label}, not this field, to choose the months.`,
        ),
        timeInterval: { base: name, grain: TimeFrames.MONTH },
    },
];

export const PYLON_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Support issues (conversations and tickets) in one Pylon workspace, one row per issue. Dates are in UTC.',
    aiHint: 'Read live from Pylon issue search, one row per issue. Without a Created filter the query reads issues created in the last 30 days. There are no metrics: count, sum or average by aggregating rows. Tags "is" keeps issues with any of the tags. Title filters match part of the title. SLA fields are empty when the issue has no SLA.',
    dimensions: [
        dimension(
            'number',
            'Number',
            DimensionType.NUMBER,
            [],
            'Issue number in the workspace.',
        ),
        text(
            'title',
            'Title',
            PYLON_TEXT_FILTERS,
            'Title of the issue.',
            'Filters match part of the title.',
        ),
        text('link', 'Link', [], 'Link to the issue in Pylon.'),
        text(
            'state',
            'State',
            PYLON_VALUE_FILTERS,
            'Status of the issue: new, waiting_on_you, waiting_on_customer, on_hold, closed, or a custom status.',
        ),
        text(
            'type',
            'Type',
            PYLON_VALUE_FILTERS,
            'Whether the issue is a conversation or a ticket.',
        ),
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
            'Tags on the issue, separated by commas.',
            '"Is" keeps issues with any of the tags.',
        ),
        ...withGrains({
            name: 'created_at',
            label: 'Created',
            description: 'Day the issue was created, in UTC.',
            happened: 'was created',
            aiHint: 'Without a filter the query reads issues created in the last 30 days.',
        }),
        ...withGrains({
            name: 'updated_at',
            label: 'Updated',
            description: 'Day the issue last changed, in UTC.',
            happened: 'was last updated',
        }),
        ...withGrains({
            name: 'resolved_at',
            label: 'Resolved',
            description: 'Day the issue was last resolved, in UTC.',
            happened: 'was last resolved',
        }),
        dimension(
            'first_response_minutes',
            'First response (minutes)',
            DimensionType.NUMBER,
            [FilterOperator.GREATER_THAN, FilterOperator.LESS_THAN],
            "Minutes from creation to the team's first reply. Empty until the team replies.",
        ),
        dimension(
            'resolution_hours',
            'Resolution time (hours)',
            DimensionType.NUMBER,
            [],
            'Hours from creation to resolution. Empty while the issue is open.',
        ),
        dimension(
            'touches',
            'Touches',
            DimensionType.NUMBER,
            PYLON_NUMBER_FILTERS,
            'Number of touches: replies and actions by the team on the issue.',
        ),
        dimension(
            'csat_score',
            'CSAT score',
            DimensionType.NUMBER,
            [],
            'Satisfaction (CSAT) score the customer gave, if they answered the survey.',
        ),
        dimension(
            'csat_comment',
            'CSAT comment',
            DimensionType.STRING,
            [],
            'Comment the customer left with their CSAT score, if any.',
        ),
        dimension(
            'first_response_due',
            'First response due',
            DimensionType.TIMESTAMP,
            [],
            "Deadline for the first response under the issue's SLA, in UTC. Empty without an SLA.",
        ),
        dimension(
            'first_response_breached',
            'First response breached',
            DimensionType.BOOLEAN,
            [],
            'Whether the first-response SLA was missed: the first reply came after the deadline, or none has come and the deadline has passed. Empty without an SLA.',
        ),
        dimension(
            'resolution_due',
            'Resolution due',
            DimensionType.TIMESTAMP,
            [],
            "Deadline for resolution under the issue's SLA, in UTC. Empty without an SLA.",
        ),
        dimension(
            'resolution_breached',
            'Resolution breached',
            DimensionType.BOOLEAN,
            [],
            'Whether the resolution SLA was missed: resolved after the deadline, or still open past it. Empty without an SLA.',
        ),
        dimension(
            'next_reply_due',
            'Next reply due',
            DimensionType.TIMESTAMP,
            [],
            "Deadline for the team's next reply under the issue's SLA, in UTC. Empty when there is none.",
        ),
        dimension(
            'first_resolved_at',
            'First resolved',
            DimensionType.DATE,
            [],
            'Day the issue was first resolved, in UTC.',
            'Resolved is the last resolution; use this for first-time resolution.',
        ),
        dimension(
            'business_first_response_minutes',
            'First response (business minutes)',
            DimensionType.NUMBER,
            [],
            "Minutes from creation to the team's first reply, counting business hours only. Empty until the team replies.",
        ),
        dimension(
            'business_resolution_hours',
            'Resolution time (business hours)',
            DimensionType.NUMBER,
            [],
            'Hours from creation to resolution, counting business hours only. Empty while the issue is open.',
        ),
        dimension(
            'created_time',
            'Created time',
            DimensionType.TIMESTAMP,
            [],
            'Date and time the issue was created, in UTC.',
            'Filter by Created, not this field.',
        ),
        dimension(
            'priority',
            'Priority',
            DimensionType.STRING,
            [],
            `Priority of the issue, from the workspace's "priority" custom field. Empty when the workspace has no such field.`,
        ),
        dimension(
            'linked_issue_sources',
            'Linked issue sources',
            DimensionType.STRING,
            [],
            'Where the linked engineering issues live, such as linear or github, separated by commas.',
        ),
        dimension(
            'linked_issue_links',
            'Linked issue links',
            DimensionType.STRING,
            [],
            'Links to the linked engineering issues, separated by commas.',
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
        'Customer accounts in one Pylon workspace, one row per account.',
    aiHint: 'Read live from Pylon account search, one row per account. No metrics: count rows to count accounts. Tags "is" keeps accounts with any of the tags. Dates are UTC days.',
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
            'Name of the account.',
        ),
        text(
            'domain',
            'Domain',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            'Primary domain of the account.',
        ),
        text(
            'type',
            'Type',
            PYLON_VALUE_FILTERS,
            'Account type, such as customer.',
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
            'Tags on the account, separated by commas.',
            '"Is" keeps accounts with any of the tags.',
        ),
        date('created_at', 'Created', 'Day the account was created, in UTC.'),
        date(
            'last_customer_activity_at',
            'Last customer activity',
            'Day of the latest message from the customer, in UTC.',
        ),
        date(
            'last_vendor_activity_at',
            'Last team activity',
            'Day of the latest message from your team, in UTC.',
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
        'Customer contacts in one Pylon workspace, one row per contact.',
    aiHint: 'Read live from Pylon contact search, one row per contact. No metrics: count rows to count contacts.',
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
            'Name of the contact.',
        ),
        text(
            'email',
            'Email',
            [...PYLON_VALUE_FILTERS, ...PYLON_TEXT_FILTERS],
            'Email address of the contact.',
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
            "Contact's role in the customer portal.",
        ),
    ],
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
