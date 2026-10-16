import { type TFunction } from 'i18next';
import shuffle from 'lodash/shuffle';

// Values are persisted as-is; only labels are translated.
const JOB_TITLES = [
    ...shuffle([
        {
            value: 'Data/Analytics Leader (manager, director, etc.)',
            key: 'dataLeader',
        },
        { value: 'Data Scientist', key: 'dataScientist' },
        { value: 'Data Analyst', key: 'dataAnalyst' },
        { value: 'Data Engineer', key: 'dataEngineer' },
        { value: 'Analytics Engineer', key: 'analyticsEngineer' },
        { value: 'Software Engineer', key: 'softwareEngineer' },
        { value: 'Sales', key: 'sales' },
        { value: 'Marketing', key: 'marketing' },
        { value: 'Product', key: 'product' },
        { value: 'Operations', key: 'operations' },
        { value: 'Customer Service', key: 'customerService' },
        { value: 'Student', key: 'student' },
    ]),
    { value: 'Other', key: 'other' },
];

export const getJobTitleOptions = (t: TFunction) =>
    JOB_TITLES.map(({ value, key }) => ({
        value,
        label: t(`jobTitles.${key}`, { ns: 'app' }),
    }));
