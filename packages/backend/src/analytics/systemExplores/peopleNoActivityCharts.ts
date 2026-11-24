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
    'people_adoption_activity_status_name',
];
const personLabels = {
    people_adoption_activity_status_name: 'Activity status',
    people_adoption_activity_through_day: 'Activity through (UTC)',
    people_adoption_organization_role_name: 'Organization role',
};

export const peopleNoActivityChartSpecs: UsageChartSpec[] = [
    {
        key: 'people-without-observed-activity',
        name: 'People who have not used Lightdash',
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
                wholeLabel: 'of members with a finished account',
                color: caution,
            },
        ),
    },
    {
        key: 'people-without-observed-activity-detail',
        name: 'Who has not used Lightdash?',
        description:
            'Members with an active account and finished setup with no confirmed activity of their own in recorded history. The Date filter does not apply.',
        explore: 'people_adoption',
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
        name: 'Who has not used Lightdash in the last 30 complete days?',
        description:
            'Members with an active account and finished setup with no confirmed activity of their own in the 30 complete days before the latest membership snapshot, including people who have never used Lightdash. The Date filter does not apply.',
        explore: 'people_adoption',
        dimensions: [
            ...personDimensions,
            // The day is enough: the time of day would show to the millisecond
            'people_adoption_last_observed_activity_at_day',
            'people_adoption_days_since_last_activity',
            'people_adoption_activity_through_day',
        ],
        metrics: [],
        // "Sep 22, 2026", and "Never" where a blank would read as missing data
        tableCalculations: [
            {
                name: 'last_used',
                displayName: 'Last used Lightdash (UTC)',
                type: TableCalculationType.STRING,
                sql: `COALESCE(strftime(\${people_adoption.last_observed_activity_at_day}, '%b %-d, %Y'), 'Never')`,
            },
        ],
        hiddenColumns: [
            'people_adoption_last_observed_activity_at_day',
            'people_adoption_activity_through_day',
        ],
        columnOrder: [
            ...personDimensions,
            'last_used',
            'people_adoption_days_since_last_activity',
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
            people_adoption_last_observed_activity_at_day:
                'Last used Lightdash (UTC)',
            people_adoption_days_since_last_activity: 'Days since last use',
        },
    },
];

export const peopleNoActivitySections = [
    {
        title: 'People who have not used Lightdash',
        description:
            'Members with an active account and finished setup, with no views, queries or agent requests made by hand. Scheduled and automated runs do not count.',
        charts: ['people-without-observed-activity'],
    },
    {
        title: 'Who has not used Lightdash?',
        description:
            'The first list covers all recorded history. The second covers the 30 complete UTC days before the latest membership snapshot.',
        charts: [
            'people-without-observed-activity-detail',
            'people-without-activity-30d-detail',
        ],
    },
];
