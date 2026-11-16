import { query } from '@lightdash/query-sdk';

const PEOPLE = 'people_adoption';

// Deactivated accounts are not people to win over
const CURRENT_PEOPLE = { field: 'is_active', operator: 'equals', value: true };

const SHAPE_DIMENSIONS = [
    'group_ids',
    'group_names',
    'organization_role',
    'last_seen',
    'last_seen_bin',
    'parts_used',
    'flow_bits',
];
const PERSON_DIMENSIONS = [
    ...SHAPE_DIMENSIONS,
    'user_id',
    'name',
    'last_seen_day',
    'active_days_30d',
];

// The most rows an overview query brings back. Counts are per combination of groups, role, recency and parts,
// so this is far above what an organisation of tens of thousands of people produces.
export const OVERVIEW_ROW_LIMIT = 5000;
export const PEOPLE_ROW_LIMIT = 2000;
// People shown in the picker while choosing who to add to a team
export const SEARCH_ROW_LIMIT = 30;

export const totalQuery = query('people_membership')
    .label('People in the organisation')
    .metrics(['total_members'])
    .filters([CURRENT_PEOPLE])
    .limit(1);

// Counts only, no names: how many people share each combination
export const countsQuery = (excludedUserIds) =>
    query(PEOPLE)
        .label('People counted by groups, role, activity and parts used')
        .dimensions(SHAPE_DIMENSIONS)
        .metrics(['total_members'])
        .filters([
            CURRENT_PEOPLE,
            ...(excludedUserIds.length > 0
                ? [
                      {
                          field: 'user_id',
                          operator: 'notEquals',
                          value: excludedUserIds,
                      },
                  ]
                : []),
        ])
        .limit(OVERVIEW_ROW_LIMIT);

// A people filter is one of: { kind: 'everyone' }, { kind: 'groups', groupIds }, { kind: 'outsideGroups', groupIds },
// { kind: 'users', userIds }

// One row per person, with their name
export const peopleQuery = (filter) => {
    const filters = [CURRENT_PEOPLE];
    if (filter.kind === 'groups') {
        filters.push({
            field: 'group_ids',
            operator: 'include',
            value: filter.groupIds,
        });
    } else if (filter.kind === 'outsideGroups' && filter.groupIds.length > 0) {
        filters.push({
            field: 'group_ids',
            operator: 'doesNotInclude',
            value: filter.groupIds,
        });
    } else if (filter.kind === 'users') {
        filters.push({
            field: 'user_id',
            operator: 'equals',
            value: filter.userIds,
        });
    } else if (filter.kind === 'search') {
        const term = filter.term.trim();
        // The warehouse matches case-sensitively, so the name is tried as typed, lower, upper and capitalised
        if (term !== '') {
            const capitalised = term.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_match, before, letter) => before + letter.toUpperCase());
            const spellings = [...new Set([term, term.toLowerCase(), term.toUpperCase(), capitalised])];
            filters.push({ field: 'name', operator: 'include', value: spellings });
        }
        return query(PEOPLE)
            .label('People matching a name')
            .dimensions(PERSON_DIMENSIONS)
            .metrics(['total_members'])
            .filters(filters)
            .sorts([{ field: 'name', direction: 'asc' }])
            .limit(SEARCH_ROW_LIMIT);
    }
    return query(PEOPLE)
        .label('People with their activity and parts used')
        .dimensions(PERSON_DIMENSIONS)
        .metrics(['total_members'])
        .filters(filters)
        .limit(PEOPLE_ROW_LIMIT);
};

// Streams where a person acted themselves; queries are left out because they include scheduled and API runs
const HUMAN_STREAMS = [
    'content_views',
    'agent_steps',
    'mcp_tool_calls',
    'data_app_events',
];

export const weeklyActiveQuery = (userIds) =>
    query('user_activity')
        .label('People active each week')
        .dimensions(['activity_date_week'])
        .metrics(['unique_users'])
        .filters([
            { field: 'user_id', operator: 'equals', value: userIds },
            { field: 'stream', operator: 'equals', value: HUMAN_STREAMS },
            {
                field: 'activity_date',
                operator: 'inThePast',
                value: 12,
                unit: 'weeks',
            },
        ])
        .sorts([{ field: 'activity_date_week', direction: 'asc' }])
        .limit(20);

export const topContentQuery = (userIds) =>
    query('content_reach')
        .label('Content opened most')
        .dimensions(['content_name', 'content_type'])
        .metrics(['distinct_viewers', 'qualifying_views'])
        .filters([
            { field: 'user_id', operator: 'equals', value: userIds },
            { field: 'is_qualifying', operator: 'equals', value: true },
            { field: 'actor_type', operator: 'equals', value: 'user' },
            {
                field: 'event_ts',
                operator: 'inThePast',
                value: 30,
                unit: 'days',
            },
        ])
        .sorts([
            { field: 'distinct_viewers', direction: 'desc' },
            { field: 'qualifying_views', direction: 'desc' },
        ])
        .limit(8);
