import { TableCalculationType } from '@lightdash/common';
import { caution } from './analyticsChartPresentation';
import { numberCard } from './chartBuilders';
import type { UsageChartSpec } from './usageDashboardTypes';

const eligiblePeople: NonNullable<UsageChartSpec['filters']> = [
    { field: 'people_adoption_is_eligible', values: [true] },
];
const personDimensions = [
    'people_adoption_name',
    'people_adoption_user_id',
    'people_adoption_organization_role_name',
];
const personLabels = {
    people_adoption_activity_through_day: 'Activity through (UTC)',
    people_adoption_organization_role_name: 'Organization role',
};
// The status in two words. The full wording ("Used Lightdash before, not in the last 30 days") ran onto
// a second line in every row, and the columns beside it already give the date and the days.
const shortStatus = {
    name: 'activity_status_short',
    displayName: 'Activity status',
    type: TableCalculationType.STRING,
    sql: `CASE \${people_adoption.activity_status_name} WHEN 'No recorded use' THEN 'Never used' WHEN 'Used Lightdash before, not in the last 30 days' THEN 'Used before' ELSE \${people_adoption.activity_status_name} END`,
};

export const peopleNoActivityChartSpecs: UsageChartSpec[] = [
    {
        key: 'people-without-observed-activity',
        name: 'Never used Lightdash',
        description:
            'Members with an active account and finished setup who have no confirmed human activity in recorded history. If this shows zero, check that the membership snapshot is available.',
        explore: 'people_adoption',
        dimensions: [],
        // Then the members it is a part of, for the card's bar
        metrics: [
            'people_adoption_people_without_observed_activity',
            'people_adoption_eligible_people',
        ],
        yFields: ['people_adoption_people_without_observed_activity'],
        limit: 1,
        sorts: [],
        visualization: 'number',
        libraryChart: numberCard(
            'people_adoption_people_without_observed_activity',
            'Members with no activity of their own',
            {
                whole: 'people_adoption_eligible_people',
                wholeLabel: 'of {target} members',
                color: caution,
            },
        ),
    },
    {
        key: 'people-without-observed-activity-detail',
        name: 'Members with no recorded use',
        description:
            'Members with an active account and finished setup with no confirmed activity of their own in recorded history. The Date filter does not apply.',
        explore: 'people_adoption',
        // No status column: every row here has the same one, no recorded use
        dimensions: [
            ...personDimensions,
            'people_adoption_activity_through_day',
        ],
        // The day activity is counted up to is the same on every row, so it is not a column
        hiddenColumns: ['people_adoption_activity_through_day'],
        metrics: [],
        filters: [
            ...eligiblePeople,
            { field: 'people_adoption_no_observed_activity', values: [true] },
        ],
        limit: 1000,
        sorts: [
            { fieldId: 'people_adoption_name', descending: false },
            { fieldId: 'people_adoption_user_id', descending: false },
        ],
        fieldLabels: personLabels,
    },
    {
        key: 'people-without-activity-30d-detail',
        name: 'Members with no use in the last 30 days',
        description:
            'Members with an active account and finished setup with no confirmed activity of their own in the 30 complete days before the latest membership snapshot, including people who have never used Lightdash. The Date filter does not apply.',
        explore: 'people_adoption',
        dimensions: [
            ...personDimensions,
            'people_adoption_activity_status_name',
            // The day is enough: the time of day would show to the millisecond
            'people_adoption_last_observed_activity_at_day',
            'people_adoption_days_since_last_activity',
            'people_adoption_activity_through_day',
        ],
        metrics: [],
        // "Sep 22, 2026", and "Never" where a blank would read as missing data
        tableCalculations: [
            shortStatus,
            {
                name: 'last_used',
                displayName: 'Last used (UTC)',
                type: TableCalculationType.STRING,
                sql: `COALESCE(strftime(\${people_adoption.last_observed_activity_at_day}, '%b %-d, %Y'), 'Never')`,
            },
        ],
        hiddenColumns: [
            'people_adoption_activity_status_name',
            'people_adoption_last_observed_activity_at_day',
            'people_adoption_activity_through_day',
        ],
        columnOrder: [
            ...personDimensions,
            shortStatus.name,
            'last_used',
            'people_adoption_days_since_last_activity',
            'people_adoption_activity_status_name',
            'people_adoption_last_observed_activity_at_day',
            'people_adoption_activity_through_day',
        ],
        filters: [
            ...eligiblePeople,
            { field: 'people_adoption_active_30d', values: [false] },
        ],
        limit: 1000,
        sorts: [
            { fieldId: 'people_adoption_name', descending: false },
            { fieldId: 'people_adoption_user_id', descending: false },
        ],
        fieldLabels: {
            ...personLabels,
            people_adoption_last_observed_activity_at_day: 'Last used (UTC)',
            people_adoption_days_since_last_activity: 'Days since last use',
        },
    },
];

// The tab is named People who have not used Lightdash, so nothing under it says that again: each
// heading and each tile title adds what its own level counts or lists.
export const peopleNoActivitySections = [
    {
        title: 'How many members have never used it?',
        description:
            'These tiles do not follow the Date filter. Use is a view, query or agent request made by hand; scheduled and automated runs do not count.',
        charts: ['people-without-observed-activity'],
    },
    {
        title: 'Who to follow up with',
        description:
            'The first list covers all recorded history. The second covers the 30 complete UTC days before the latest membership snapshot.',
        charts: [
            'people-without-observed-activity-detail',
            'people-without-activity-30d-detail',
        ],
    },
];
