// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const airtableUseCases: LiveUseCases = {
    questions: [
        {
            id: 'airtable-q-1',
            question: 'Which tickets were created in the last 7 days?',
            possible: true,
        },
        {
            id: 'airtable-q-2',
            question: 'Which open tickets are assigned to each person?',
            possible: true,
        },
        {
            id: 'airtable-q-3',
            question: 'Which tickets have been open for more than two weeks?',
            possible: true,
        },
        {
            id: 'airtable-q-4',
            question: 'Show high-priority tickets that are not resolved.',
            possible: true,
        },
        {
            id: 'airtable-q-5',
            question: 'Which records have an empty owner?',
            possible: true,
        },
        {
            id: 'airtable-q-6',
            question: 'List records whose name contains a given word.',
            possible: true,
        },
        {
            id: 'airtable-q-7',
            question: 'Show the records in a saved Airtable view.',
            possible: true,
        },
        {
            id: 'airtable-q-8',
            question: 'How many tickets were closed per week?',
            possible: false,
        },
        {
            id: 'airtable-q-9',
            question: 'What is the average resolution time per assignee?',
            possible: false,
        },
        {
            id: 'airtable-q-10',
            question: 'How many records does each table in the base have?',
            possible: false,
        },
        {
            id: 'airtable-q-11',
            question:
                'Which projects are active, from another table in the same base?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'airtable-d-1',
            name: 'Team ticket performance',
            purpose:
                'A support lead tracks how the team keeps up with tickets tracked in Airtable.',
            charts: [
                {
                    id: 'airtable-d-1-c-1',
                    title: 'Open tickets',
                    detail: 'Table of unresolved tickets with assignee, priority and age.',
                    possible: true,
                },
                {
                    id: 'airtable-d-1-c-2',
                    title: 'Tickets created per week',
                    detail: 'Bar chart of new tickets per week, counted from Created time.',
                    possible: false,
                },
                {
                    id: 'airtable-d-1-c-3',
                    title: 'Tickets closed per assignee',
                    detail: 'Bar chart of tickets resolved this month by assignee.',
                    possible: false,
                },
            ],
        },
        {
            id: 'airtable-d-2',
            name: 'Recent changes',
            purpose: 'Someone checks what the team added to a base this week.',
            charts: [
                {
                    id: 'airtable-d-2-c-1',
                    title: 'New records',
                    detail: 'Table of records created in the last 7 days, newest first.',
                    possible: true,
                },
            ],
        },
    ],
};

export const airtableSpec: LiveIntegrationSpec = {
    auth: {
        description:
            'No vendor review is needed. A personal access token with data.records:read and schema.bases:read reads the bases it is given.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    useCases: airtableUseCases,
};
