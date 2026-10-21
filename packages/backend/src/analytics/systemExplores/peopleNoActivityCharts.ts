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
    people_adoption_activity_status: 'Observed activity',
    people_adoption_activity_through_day: 'Activity through (UTC)',
    people_adoption_organization_role: 'Organization role',
};

export const peopleNoActivityChartSpecs: UsageChartSpec[] = [
    {
        key: 'people-without-observed-activity',
        name: 'People with no observed activity',
        description:
            'Current active, setup-complete members with no confirmed human activity in retained capture. Missing capture does not prove someone has never used the app. A zero also requires checking that the membership snapshot is available.',
        explore: 'people_adoption',
        dimensions: [],
        metrics: ['people_adoption_people_without_observed_activity'],
        limit: 1,
        sorts: [],
        visualization: 'number',
    },
    {
        key: 'people-without-observed-activity-detail',
        name: 'Who has no observed activity?',
        description:
            'Current active, setup-complete members with no confirmed human activity in retained capture. This includes people with only automated, inferred or unclassified activity. Missing capture does not prove someone has never used the app. Names fall back to user UUIDs; up to 1,000 people are shown.',
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
        name: 'Who had no observed activity in the last 30 closed days?',
        description:
            'Current active, setup-complete members without confirmed human activity in the 30 closed UTC days before the membership snapshot. Includes both people with no observed activity and previously observed people who have lapsed; activity status distinguishes them. Names fall back to user UUIDs; up to 1,000 people are shown.',
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
                'Last observed human activity (UTC)',
            people_adoption_days_since_last_activity:
                'Days since observed human activity',
        },
    },
];

export const peopleNoActivitySections = [
    {
        title: 'People with no observed activity',
        description:
            'Current active, setup-complete members, including people with no recorded events. Only confirmed human activity counts here; automated, inferred and unclassified activity are excluded. Missing capture does not prove inactivity.',
        charts: ['people-without-observed-activity'],
    },
    {
        title: 'Who has no observed activity?',
        description:
            'The first list covers all retained capture; the second covers the 30 closed UTC days before the latest membership snapshot and includes previously active people. Activity through shows the cutoff. These charts ignore event date, app and surface filters.',
        charts: [
            'people-without-observed-activity-detail',
            'people-without-activity-30d-detail',
        ],
    },
];
