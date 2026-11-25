import type { UsageChartSpec } from './usageDashboardTypes';

const eligiblePeople: NonNullable<UsageChartSpec['filters']> = [
    { field: 'people_adoption_is_eligible', values: [true] },
];
const personDimensions = [
    'people_adoption_name',
    'people_adoption_user_id',
    'people_adoption_organization_role',
    'people_adoption_activity_status',
];
const personLabels = {
    people_adoption_activity_status: 'Activity status',
    people_adoption_activity_through_day: 'Activity through (UTC)',
    people_adoption_organization_role: 'Organization role',
};

export const peopleNoActivityChartSpecs: UsageChartSpec[] = [
    {
        key: 'people-without-observed-activity',
        name: 'People who have not used Lightdash',
        description:
            'Members with an active account and finished setup who have no confirmed human activity in recorded history. If this shows zero, check that the membership snapshot is available.',
        explore: 'people_adoption',
        dimensions: [],
        metrics: ['people_adoption_people_without_observed_activity'],
        limit: 1,
        sorts: [],
        visualization: 'number',
    },
    {
        key: 'people-without-observed-activity-detail',
        name: 'Who has not used Lightdash?',
        description:
            'Members with an active account and finished setup who have no confirmed human activity in recorded history. This includes people with only automated, inferred or unclassified activity. People without a name show their primary email, or their user UUID if there is no email. Shows up to 1,000 people. Activity through shows the cut-off date. The Date filter does not apply.',
        explore: 'people_adoption',
        dimensions: [
            ...personDimensions,
            'people_adoption_activity_through_day',
        ],
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
            'Members with an active account and finished setup who have no confirmed human activity in the 30 complete UTC days before the membership snapshot. Includes people who have never used Lightdash and people who used it earlier but have lapsed. Activity status tells them apart. People without a name show their primary email, or their user UUID if there is no email. Shows up to 1,000 people. Activity through shows the cut-off date. The Date filter does not apply.',
        explore: 'people_adoption',
        dimensions: [
            ...personDimensions,
            'people_adoption_last_observed_activity_at',
            'people_adoption_days_since_last_activity',
            'people_adoption_activity_through_day',
        ],
        metrics: [],
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
            people_adoption_last_observed_activity_at:
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
