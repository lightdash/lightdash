// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const attioUseCases: LiveUseCases = {
    questions: [
        {
            id: 'ATT-01',
            question:
                'How many deals are currently in each pipeline stage, split by deal owner?',
            possible: false,
        },
        {
            id: 'ATT-02',
            question:
                'For deals created this quarter, what is the conversion rate between each stage from Lead to Won?',
            possible: false,
        },
        {
            id: 'ATT-03',
            question:
                'What is our win rate for deals with enterprise-sized companies compared with all other deals?',
            possible: false,
        },
        {
            id: 'ATT-04',
            question:
                'How long do won deals spend in each stage on average, and which owner moves deals through fastest?',
            possible: false,
        },
        {
            id: 'ATT-05',
            question:
                'How much deal value moved into Won this quarter compared with last quarter?',
            possible: true,
        },
        {
            id: 'ATT-06',
            question:
                'How many deals, and how much deal value, sat in each stage at the end of every month over the past year?',
            possible: false,
        },
        {
            id: 'ATT-07',
            question:
                'How has total MRR grown month by month over the last year?',
            possible: false,
        },
        {
            id: 'ATT-08',
            question:
                'Which deal owner moved the most deals into Won each month this year?',
            possible: false,
        },
        {
            id: 'ATT-09',
            question: 'From which stage are deals most often marked Lost?',
            possible: false,
        },
        {
            id: 'ATT-10',
            question:
                'Which open deals have been sitting in their current stage for more than 30 days?',
            possible: false,
        },
        {
            id: 'ATT-11',
            question:
                'When did anyone on our team last email or meet with a given company, and who was involved?',
            possible: false,
        },
        {
            id: 'ATT-12',
            question:
                'How many meetings and emails did each team member have with prospects per week this quarter?',
            possible: false,
        },
        {
            id: 'ATT-13',
            question:
                'Which lead sources produced the most won deal value this year?',
            possible: true,
        },
        {
            id: 'ATT-14',
            question:
                'Of the deals created in each month, what share was won within 60 days?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-09',
            name: 'Sales reporting dashboard',
            purpose:
                'Weekly sales review: pipeline by stage, stage conversion, win rate, time to close and qualified-deal flow against target.',
            charts: [
                {
                    id: 'DB-09.1',
                    title: 'Deals in stage',
                    detail: 'count of deals per stage for active stages, optionally split by deal owner or value',
                    possible: true,
                },
                {
                    id: 'DB-09.2',
                    title: 'Funnel analysis',
                    detail: 'conversion between each deal stage for deals created in the chosen time frame',
                    possible: false,
                },
                {
                    id: 'DB-09.3',
                    title: 'Win rate',
                    detail: 'share of all deals that reached Won',
                    possible: true,
                },
                {
                    id: 'DB-09.4',
                    title: 'Average time to close',
                    detail: 'average time won deals spent in each stage before Won, optionally by deal owner',
                    possible: false,
                },
                {
                    id: 'DB-09.5',
                    title: 'Deals moving to each stage',
                    detail: 'count of deals entering each stage during the time frame',
                    possible: false,
                },
                {
                    id: 'DB-09.6',
                    title: 'Qualified deals each month',
                    detail: 'deals entering the Qualification stage per month against a monthly target',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-10',
            name: 'Revenue overview (ARR / MRR)',
            purpose:
                'Board and investor updates: how recurring revenue is growing and where customers and revenue are concentrated.',
            charts: [
                {
                    id: 'DB-10.1',
                    title: 'Total ARR',
                    detail: 'sum of ARR across customer workspaces',
                    possible: true,
                },
                {
                    id: 'DB-10.2',
                    title: 'ARR growth',
                    detail: 'ARR grouped by current subscription start date',
                    possible: true,
                },
                {
                    id: 'DB-10.3',
                    title: 'MRR growth over the last year',
                    detail: 'total MRR at the end of each month from attribute history',
                    possible: false,
                },
                {
                    id: 'DB-10.4',
                    title: 'Revenue by subscription plan',
                    detail: 'ARR segmented by plan',
                    possible: true,
                },
                {
                    id: 'DB-10.5',
                    title: 'Customers by location',
                    detail: 'customer count by geography',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-11',
            name: 'Deal owner performance',
            purpose:
                "Rep 1:1s: each owner's active pipeline, closed deals, deal size and speed through stages.",
            charts: [
                {
                    id: 'DB-11.1',
                    title: 'Active deals in each stage',
                    detail: 'count of active deals per stage, split by owner',
                    possible: false,
                },
                {
                    id: 'DB-11.2',
                    title: 'Average deal size per owner',
                    detail: 'average deal value grouped by deal owner',
                    possible: false,
                },
                {
                    id: 'DB-11.3',
                    title: 'Deals closed per month per owner',
                    detail: 'closed deals by month of close date, split by owner',
                    possible: false,
                },
                {
                    id: 'DB-11.4',
                    title: 'Deal value moving into Won each quarter',
                    detail: 'sum of deal value entering Won per quarter',
                    possible: true,
                },
                {
                    id: 'DB-11.5',
                    title: 'Stage durations by owner',
                    detail: 'average time in each stage compared between deal owners',
                    possible: false,
                },
            ],
        },
    ],
};
