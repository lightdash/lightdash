import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    TimeFrames,
} from '@lightdash/common';
import {
    dimension,
    type LiveExploreDefinition,
    type LiveModel,
} from '../../sdk';

/** Search takes a list of values per field, so "is" and "is not" take several. */
export const INTERCOM_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const INTERCOM_TEXT_FILTERS = [
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const INTERCOM_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

/** Durations and counts compare; "is" on a duration in minutes rarely matches. */
const RANGE_FILTERS = [FilterOperator.GREATER_THAN, FilterOperator.LESS_THAN];

export const INTERCOM_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const INTERCOM_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or Intercom's first day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const INTERCOM_CONVERSATIONS_EXPLORE: LiveExploreDefinition = {
    name: 'conversations',
    label: 'Conversations',
    description:
        "Conversations in one Intercom workspace, one row per conversation, with Intercom's own response and close times, rating, SLA and Fin AI agent outcome. Dates are in UTC.",
    aiHint: 'Read live from Intercom conversation search, one row per conversation; a query reads at most 5,999 conversations. Without a Created filter the query reads conversations created in the last 30 days. There are no metrics: count, sum, average or take the median by aggregating rows. Tag IDs "is" keeps conversations with any of the tags; read Tags and Tag IDs together to learn the IDs. Team and Teammate names match exactly. Title, handling time and SLA fields cannot be filtered.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'created_at', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Conversation ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Intercom ID of the conversation.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Title of the conversation, if it has one.',
        }),
        dimension({
            name: 'state',
            label: 'State',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'State of the conversation: open, closed or snoozed.',
        }),
        dimension({
            name: 'priority',
            label: 'Priority',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Priority Intercom gives the conversation.',
        }),
        dimension({
            name: 'source_type',
            label: 'Channel',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'How the conversation started, such as conversation (Messenger) or email.',
        }),
        dimension({
            name: 'team_assignee_id',
            label: 'Team ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom ID of the team inbox the conversation is assigned to. Empty when unassigned.',
        }),
        dimension({
            name: 'team_assignee_name',
            label: 'Team',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Name of the team inbox the conversation is assigned to. Empty when unassigned.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'admin_assignee_id',
            label: 'Teammate ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom ID of the teammate the conversation is assigned to. Empty when unassigned.',
        }),
        dimension({
            name: 'admin_assignee_name',
            label: 'Teammate',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Name of the teammate the conversation is assigned to. Empty when unassigned.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'tags',
            label: 'Tags',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Names of the tags on the conversation, separated by commas.',
            aiHint: 'To filter by tag, use Tag IDs.',
        }),
        dimension({
            name: 'tag_ids',
            label: 'Tag IDs',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom IDs of the tags on the conversation, separated by commas.',
            aiHint: '"Is" keeps conversations with any of the tags.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the conversation was created, in UTC.',
            aiHint: 'Without a filter the query reads conversations created in the last 30 days.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_week',
            label: 'Created week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the conversation was created, shown as its Monday, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the weeks.',
            timeInterval: { base: 'created_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'created_at_month',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the conversation was created, shown as its first day, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the months.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'updated_at',
            label: 'Updated',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the conversation last changed, in UTC.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'updated_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'updated_at_week',
            label: 'Updated week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the conversation last changed, shown as its Monday, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the weeks.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'updated_at_month',
            label: 'Updated month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the conversation last changed, shown as its first day, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the months.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'last_closed_at',
            label: 'Last closed',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description:
                'Day the conversation was last closed, in UTC. Empty if it was never closed.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'last_closed_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'last_closed_at_week',
            label: 'Last closed week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the conversation was last closed, shown as its Monday, in UTC.',
            aiHint: 'Filter Last closed, not this field, to choose the weeks.',
            timeInterval: { base: 'last_closed_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'last_closed_at_month',
            label: 'Last closed month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the conversation was last closed, shown as its first day, in UTC.',
            aiHint: 'Filter Last closed, not this field, to choose the months.',
            timeInterval: { base: 'last_closed_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'first_admin_reply_at',
            label: 'First teammate reply',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description:
                'Day a teammate first replied, in UTC. Empty until one does.',
        }),
        dimension({
            name: 'created_time',
            label: 'Created time',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'Date and time the conversation was created, in UTC.',
        }),
        dimension({
            name: 'waiting_since',
            label: 'Waiting since',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description:
                'When the customer started waiting for a teammate reply, in UTC. Empty when the last reply was from a teammate.',
        }),
        dimension({
            name: 'snoozed_until',
            label: 'Snoozed until',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'When a snoozed conversation reopens, in UTC.',
        }),
        dimension({
            name: 'time_to_assignment_minutes',
            label: 'Time to assignment (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: RANGE_FILTERS,
            description:
                "Minutes from creation to the first assignment. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'time_to_admin_reply_minutes',
            label: 'Time to first reply (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: RANGE_FILTERS,
            description:
                "Minutes from the customer's first message to a teammate's first reply. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'time_to_first_close_minutes',
            label: 'Time to first close (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: RANGE_FILTERS,
            description:
                "Minutes from creation to the first close. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'time_to_last_close_minutes',
            label: 'Time to last close (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: RANGE_FILTERS,
            description:
                "Minutes from creation to the last close. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'median_time_to_reply_minutes',
            label: 'Median time to reply (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: RANGE_FILTERS,
            description:
                "Median minutes a teammate took to reply to the customer's messages in the conversation. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'handling_time_minutes',
            label: 'Handling time (minutes)',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Minutes from assignment to close. In calendar minutes, from Intercom's conversation statistics. Empty until it happens.",
        }),
        dimension({
            name: 'count_reopens',
            label: 'Reopens',
            type: DimensionType.NUMBER,
            filterOperators: INTERCOM_NUMBER_FILTERS,
            description: 'Times the conversation was reopened.',
        }),
        dimension({
            name: 'count_assignments',
            label: 'Assignments',
            type: DimensionType.NUMBER,
            filterOperators: INTERCOM_NUMBER_FILTERS,
            description: 'Times the conversation was assigned.',
        }),
        dimension({
            name: 'count_conversation_parts',
            label: 'Conversation parts',
            type: DimensionType.NUMBER,
            filterOperators: INTERCOM_NUMBER_FILTERS,
            description:
                'Parts in the conversation: messages, notes and actions.',
        }),
        dimension({
            name: 'last_closed_by_id',
            label: 'Last closed by ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom ID of the teammate who last closed the conversation.',
        }),
        dimension({
            name: 'last_closed_by_name',
            label: 'Last closed by',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Name of the teammate who last closed the conversation.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'rating',
            label: 'Rating',
            type: DimensionType.NUMBER,
            filterOperators: INTERCOM_NUMBER_FILTERS,
            description:
                'Rating from 1 to 5 the customer gave the conversation. Empty when not rated.',
        }),
        dimension({
            name: 'rating_remark',
            label: 'Rating remark',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'What the customer wrote with their rating, if anything.',
        }),
        dimension({
            name: 'rating_teammate_id',
            label: 'Rated teammate ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Intercom ID of the teammate the rating is for.',
        }),
        dimension({
            name: 'rating_teammate_name',
            label: 'Rated teammate',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Name of the teammate the rating is for.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'rated_at',
            label: 'Rated at',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'When the customer rated the conversation, in UTC.',
        }),
        dimension({
            name: 'sla_name',
            label: 'SLA',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Name of the SLA applied to the conversation. Empty without one.',
        }),
        dimension({
            name: 'sla_status',
            label: 'SLA status',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Whether the SLA was hit, missed, canceled or is still active. Empty without an SLA.',
        }),
        dimension({
            name: 'ai_agent_participated',
            label: 'Fin participated',
            type: DimensionType.BOOLEAN,
            filterOperators: INTERCOM_BOOLEAN_FILTERS,
            description:
                'Whether the Fin AI agent took part in the conversation.',
        }),
        dimension({
            name: 'ai_agent_resolution_state',
            label: 'Fin resolution state',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                "Fin's outcome: assumed_resolution, confirmed_resolution, escalated, negative_feedback or procedure_handoff. Empty when Fin didn't take part.",
        }),
        dimension({
            name: 'ai_agent_last_answer_type',
            label: 'Fin last answer type',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: "Fin's last answer: ai_answer or custom_answer.",
        }),
        dimension({
            name: 'ai_agent_source_type',
            label: 'Fin source type',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'What started Fin in the conversation, such as workflow or profile.',
        }),
        dimension({
            name: 'ai_agent_source_title',
            label: 'Fin source',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Title of the workflow or profile that started Fin.',
        }),
        dimension({
            name: 'ai_agent_rating',
            label: 'Fin rating',
            type: DimensionType.NUMBER,
            filterOperators: INTERCOM_NUMBER_FILTERS,
            description:
                'Rating from 1 to 5 the customer gave Fin. Empty when not rated.',
        }),
        dimension({
            name: 'ai_agent_rating_remark',
            label: 'Fin rating remark',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'What the customer wrote with their rating of Fin, if anything.',
        }),
    ],
    metrics: [],
};

/** Ticket categories as search takes them, labelled as Intercom shows them. */

export const INTERCOM_TICKET_CATEGORY_LABELS = {
    request: 'Customer',
    task: 'Back-office',
    tracker: 'Tracker',
} as const;

export const INTERCOM_TICKETS_EXPLORE: LiveExploreDefinition = {
    name: 'tickets',
    label: 'Tickets',
    description:
        'Tickets in one Intercom workspace, one row per ticket. Dates are in UTC.',
    aiHint: 'Read live from Intercom ticket search, one row per ticket; a query reads at most 5,999 tickets. Without a Created filter the query reads tickets created in the last 30 days. There are no metrics: count rows to count tickets. Title filters match part of the title. Team and Teammate names match exactly.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'created_at', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Ticket ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Intercom ID of the ticket, as the API uses it.',
        }),
        dimension({
            name: 'ticket_id',
            label: 'Ticket number',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'ID of the ticket as the Inbox and Messenger show it.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_TEXT_FILTERS,
            description: 'Title of the ticket.',
            aiHint: 'Filters match part of the title.',
        }),
        dimension({
            name: 'category',
            label: 'Category',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Category of the ticket type: Customer, Back-office or Tracker.',
            valueLabels: INTERCOM_TICKET_CATEGORY_LABELS,
        }),
        dimension({
            name: 'ticket_type_id',
            label: 'Ticket type ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Intercom ID of the ticket type.',
        }),
        dimension({
            name: 'ticket_type',
            label: 'Ticket type',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Name of the ticket type.',
        }),
        dimension({
            name: 'ticket_state',
            label: 'State',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "The ticket's state, as teammates see it.",
        }),
        dimension({
            name: 'ticket_state_category',
            label: 'State category',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                "Category of the ticket's state: submitted, in_progress, waiting_on_customer or resolved.",
        }),
        dimension({
            name: 'open',
            label: 'Open',
            type: DimensionType.BOOLEAN,
            filterOperators: INTERCOM_BOOLEAN_FILTERS,
            description: 'Whether the ticket is open.',
        }),
        dimension({
            name: 'team_assignee_id',
            label: 'Team ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom ID of the team inbox the ticket is assigned to. Empty when unassigned.',
        }),
        dimension({
            name: 'team_assignee_name',
            label: 'Team',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Name of the team inbox the ticket is assigned to. Empty when unassigned.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'admin_assignee_id',
            label: 'Teammate ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Intercom ID of the teammate the ticket is assigned to. Empty when unassigned.',
        }),
        dimension({
            name: 'admin_assignee_name',
            label: 'Teammate',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description:
                'Name of the teammate the ticket is assigned to. Empty when unassigned.',
            aiHint: 'Names match exactly, as Intercom shows them.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the ticket was created, in UTC.',
            aiHint: 'Without a filter the query reads tickets created in the last 30 days.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_week',
            label: 'Created week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the ticket was created, shown as its Monday, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the weeks.',
            timeInterval: { base: 'created_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'created_at_month',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the ticket was created, shown as its first day, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the months.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'updated_at',
            label: 'Updated',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the ticket last changed, in UTC.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'updated_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'updated_at_week',
            label: 'Updated week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the ticket last changed, shown as its Monday, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the weeks.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'updated_at_month',
            label: 'Updated month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the ticket last changed, shown as its first day, in UTC.',
            aiHint: 'Filter Updated, not this field, to choose the months.',
            timeInterval: { base: 'updated_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'created_time',
            label: 'Created time',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'Date and time the ticket was created, in UTC.',
        }),
        dimension({
            name: 'snoozed_until',
            label: 'Snoozed until',
            type: DimensionType.TIMESTAMP,
            filterOperators: [],
            description: 'When a snoozed ticket reopens, in UTC.',
        }),
    ],
    metrics: [],
};

export const INTERCOM_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Users and leads in one Intercom workspace, one row per contact. Dates are in UTC.',
    aiHint: 'Read live from Intercom contact search, one row per contact; a query reads at most 5,999 contacts, so filter by Created or Role. There are no metrics: count rows to count contacts.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Contact ID',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Intercom ID of the contact.',
        }),
        dimension({
            name: 'role',
            label: 'Role',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Whether the contact is a user or a lead.',
        }),
        dimension({
            name: 'name',
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [
                ...INTERCOM_VALUE_FILTERS,
                ...INTERCOM_TEXT_FILTERS,
            ],
            description: 'Name of the contact.',
        }),
        dimension({
            name: 'email',
            label: 'Email',
            type: DimensionType.STRING,
            filterOperators: [
                ...INTERCOM_VALUE_FILTERS,
                ...INTERCOM_TEXT_FILTERS,
            ],
            description: 'Email address of the contact.',
        }),
        dimension({
            name: 'email_domain',
            label: 'Email domain',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: "Domain of the contact's email address.",
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: INTERCOM_VALUE_FILTERS,
            description: 'Country Intercom located the contact in.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the contact was created, in UTC.',
            // The day is its own grain, grouped with the coarser ones
            timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'created_at_week',
            label: 'Created week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the contact was created, shown as its Monday, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the weeks.',
            timeInterval: { base: 'created_at', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'created_at_month',
            label: 'Created month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the contact was created, shown as its first day, in UTC.',
            aiHint: 'Filter Created, not this field, to choose the months.',
            timeInterval: { base: 'created_at', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'signed_up_at',
            label: 'Signed up',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the user signed up, in UTC.',
        }),
        dimension({
            name: 'last_seen_at',
            label: 'Last seen',
            type: DimensionType.DATE,
            filterOperators: INTERCOM_DATE_FILTERS,
            description: 'Day the contact was last seen, in UTC.',
        }),
    ],
    metrics: [],
};

export const INTERCOM_TEAMMATES_EXPLORE: LiveExploreDefinition = {
    name: 'teammates',
    label: 'Teammates',
    description:
        'Teammates (admins) in one Intercom workspace, one row per teammate, with the teams they are in.',
    aiHint: 'Read live from the Intercom teammate list, one row per teammate. Nothing can be filtered.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Teammate ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Intercom ID of the teammate.',
        }),
        dimension({
            name: 'name',
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Name of the teammate.',
        }),
        dimension({
            name: 'email',
            label: 'Email',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Email address of the teammate.',
        }),
        dimension({
            name: 'job_title',
            label: 'Job title',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Job title of the teammate.',
        }),
        dimension({
            name: 'away_mode_enabled',
            label: 'Away',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description: 'Whether the teammate is set to away.',
        }),
        dimension({
            name: 'has_inbox_seat',
            label: 'Has inbox seat',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description: 'Whether the teammate has a paid inbox seat.',
        }),
        dimension({
            name: 'team_names',
            label: 'Teams',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Names of the teams the teammate is in, separated by commas.',
        }),
    ],
    metrics: [],
};

export const INTERCOM_TEAMS_EXPLORE: LiveExploreDefinition = {
    name: 'teams',
    label: 'Teams',
    description: 'Teams in one Intercom workspace, one row per team.',
    aiHint: 'Read live from the Intercom team list, one row per team. Nothing can be filtered.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Team ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Intercom ID of the team.',
        }),
        dimension({
            name: 'name',
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Name of the team.',
        }),
        dimension({
            name: 'teammate_count',
            label: 'Teammates',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Number of teammates in the team.',
        }),
    ],
    metrics: [],
};

export const INTERCOM_EXPLORES = [
    INTERCOM_CONVERSATIONS_EXPLORE,
    INTERCOM_TICKETS_EXPLORE,
    INTERCOM_CONTACTS_EXPLORE,
    INTERCOM_TEAMMATES_EXPLORE,
    INTERCOM_TEAMS_EXPLORE,
] as const;

export const intercomModel: LiveModel<ApiConnectorType.INTERCOM> = {
    explores: INTERCOM_EXPLORES,
};
