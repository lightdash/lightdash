// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const attioUseCases: LiveUseCases = {
    questions: [
        {
            id: 'ATT-01',
            question:
                'How many deals are currently in each pipeline stage, split by deal owner?',
            expect: 'needs_change',
            why: 'Attio has no counts or grouping, so the agent reads the deals (stage, owner) and counts them in a DuckDB step. Owners come back as workspace member ids, not names.',
        },
        {
            id: 'ATT-02',
            question:
                'For deals created this quarter, what is the conversion rate between each stage from Lead to Won?',
            expect: 'needs_change',
            why: 'A deal record holds only its current stage, so which stages a deal passed through is unknown. Attio keeps the stage history, but only one record at a time on a separate endpoint the integration does not call.',
        },
        {
            id: 'ATT-03',
            question:
                'What is our win rate for deals with enterprise-sized companies compared with all other deals?',
            expect: 'needs_change',
            why: "Needs two live data sources, deals and companies. Deals carry the associated company's record id, so a DuckDB step joins them to a companies read filtered to enterprise sizes and compares won against lost by current stage.",
        },
        {
            id: 'ATT-04',
            question:
                'How long do won deals spend in each stage on average, and which owner moves deals through fastest?',
            expect: 'needs_change',
            why: 'Time spent in each earlier stage needs every stage change of each won deal; the record holds the current stage only, and Attio serves history one record at a time.',
        },
        {
            id: 'ATT-05',
            question:
                'How much deal value moved into Won this quarter compared with last quarter?',
            expect: 'answer',
            why: 'The date a deal became Won is the start time of its current stage value, which Attio returns with each record but the integration drops (it keeps only the stage title). Standard deals have no close-date attribute; workspaces that added one can answer this today under the cap.',
            tags: ['capped'],
        },
        {
            id: 'ATT-06',
            question:
                'How many deals, and how much deal value, sat in each stage at the end of every month over the past year?',
            expect: 'needs_change',
            why: 'Month-end snapshots need the stage and value each deal had on past dates. Attio keeps that history but serves it per record and per attribute, and the integration reads current values only.',
        },
        {
            id: 'ATT-07',
            question:
                'How has total MRR grown month by month over the last year?',
            expect: 'needs_change',
            why: "Past MRR values exist only in the attribute's history, served one record at a time; the integration reads the current MRR of each record.",
        },
        {
            id: 'ATT-08',
            question:
                'Which deal owner moved the most deals into Won each month this year?',
            expect: 'needs_change',
            why: 'Needs the month each deal became Won, which is the start time of the current stage value and is dropped by the integration today; owners also come back as member ids.',
        },
        {
            id: 'ATT-09',
            question: 'From which stage are deals most often marked Lost?',
            expect: 'needs_change',
            why: 'The stage a deal was in before Lost is only in its stage history, which Attio serves per record and the integration does not read.',
        },
        {
            id: 'ATT-10',
            question:
                'Which open deals have been sitting in their current stage for more than 30 days?',
            expect: 'needs_change',
            why: 'How long a deal has been in its current stage is the start time of the current stage value, which Attio sends with each record but the integration does not expose.',
        },
        {
            id: 'ATT-11',
            question:
                'When did anyone on our team last email or meet with a given company, and who was involved?',
            expect: 'needs_change',
            why: 'Company records carry last email and last calendar interaction attributes, so a filter on the company returns when the last touch happened. Who on the team was involved is part of the same value but the integration keeps only the timestamp.',
        },
        {
            id: 'ATT-12',
            question:
                'How many meetings and emails did each team member have with prospects per week this quarter?',
            expect: 'api_cant',
            why: "Counting emails per team member needs email records, and no Attio REST endpoint for emails was found; meetings alone could be read from Attio's beta meetings endpoint. A source reads one object's records, so neither is available today.",
        },
        {
            id: 'ATT-13',
            question:
                'Which lead sources produced the most won deal value this year?',
            expect: 'answer',
            why: "If lead source is an attribute on the deal, the agent reads won deals (value, source) and sums in DuckDB; if it sits on the person or company, a second live data source and a DuckDB join on the record reference are needed. 'This year' can only use the creation date unless the workspace has a close-date attribute.",
            tags: ['capped'],
        },
        {
            id: 'ATT-14',
            question:
                'Of the deals created in each month, what share was won within 60 days?',
            expect: 'answer',
            why: "Needs the date each deal became Won to compare with its creation date; that is the current stage value's start time, which the integration drops.",
            tags: ['capped'],
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
                    expect: 'answer',
                    why: 'Attio has no counts, so deals are read (stage, owner, value) and counted in DuckDB; owners show as ids.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-09.2',
                    title: 'Funnel analysis',
                    detail: 'conversion between each deal stage for deals created in the chosen time frame',
                    expect: 'needs_change',
                    why: "Conversion between stages needs each deal's stage history, which Attio serves one record at a time and the integration does not read.",
                },
                {
                    id: 'DB-09.3',
                    title: 'Win rate',
                    detail: 'share of all deals that reached Won',
                    expect: 'answer',
                    why: 'Deals are read with their current stage and DuckDB divides Won by all.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-09.4',
                    title: 'Average time to close',
                    detail: 'average time won deals spent in each stage before Won, optionally by deal owner',
                    expect: 'needs_change',
                    why: 'Time in each earlier stage needs stage history per won deal.',
                },
                {
                    id: 'DB-09.5',
                    title: 'Deals moving to each stage',
                    detail: 'count of deals entering each stage during the time frame',
                    expect: 'needs_change',
                    why: 'Deals entering each stage in a period needs every stage change, not only the current stage.',
                },
                {
                    id: 'DB-09.6',
                    title: 'Qualified deals each month',
                    detail: 'deals entering the Qualification stage per month against a monthly target',
                    expect: 'needs_change',
                    why: 'Deals entering Qualification per month needs stage history; the monthly target would be a fixed reference line.',
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
                    expect: 'answer',
                    why: 'Customer records are read with their ARR and summed in DuckDB; Attio has no totals.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.2',
                    title: 'ARR growth',
                    detail: 'ARR grouped by current subscription start date',
                    expect: 'answer',
                    why: 'Records are read with ARR and subscription start date and grouped by month in DuckDB.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.3',
                    title: 'MRR growth over the last year',
                    detail: 'total MRR at the end of each month from attribute history',
                    expect: 'needs_change',
                    why: "Month-end MRR needs the attribute's past values, which Attio serves one record at a time and the integration does not read.",
                },
                {
                    id: 'DB-10.4',
                    title: 'Revenue by subscription plan',
                    detail: 'ARR segmented by plan',
                    expect: 'answer',
                    why: 'Records are read with ARR and plan and summed per plan in DuckDB.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.5',
                    title: 'Customers by location',
                    detail: 'customer count by geography',
                    expect: 'answer',
                    why: 'Records are read with their location, which comes back as one address string, so DuckDB has to pull the country code out of it before counting.',
                    tags: ['capped'],
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
                    expect: 'needs_change',
                    why: 'Deals are read with stage and owner and counted in DuckDB; owners show as workspace member ids.',
                },
                {
                    id: 'DB-11.2',
                    title: 'Average deal size per owner',
                    detail: 'average deal value grouped by deal owner',
                    expect: 'needs_change',
                    why: 'Deals are read with value and owner and averaged per owner in DuckDB; owners show as ids.',
                },
                {
                    id: 'DB-11.3',
                    title: 'Deals closed per month per owner',
                    detail: 'closed deals by month of close date, split by owner',
                    expect: 'needs_change',
                    why: 'Standard deals have no close date; the date a deal closed is the start time of its current stage value, which the integration drops.',
                },
                {
                    id: 'DB-11.4',
                    title: 'Deal value moving into Won each quarter',
                    detail: 'sum of deal value entering Won per quarter',
                    expect: 'answer',
                    why: "Value entering Won per quarter needs the date each deal became Won, the stage value's start time, which is not exposed.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-11.5',
                    title: 'Stage durations by owner',
                    detail: 'average time in each stage compared between deal owners',
                    expect: 'needs_change',
                    why: 'Time in each stage per owner needs stage history per deal.',
                },
            ],
        },
    ],
};
