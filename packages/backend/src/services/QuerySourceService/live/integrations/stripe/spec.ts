// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const stripeUseCases: LiveUseCases = {
    questions: [
        {
            id: 'stripe-q-1',
            question:
                'What was our gross payment volume each month over the last 12 months?',
            possible: true,
        },
        {
            id: 'stripe-q-2',
            question:
                'What was net volume after refunds and Stripe fees each month this year?',
            possible: true,
        },
        {
            id: 'stripe-q-3',
            question:
                'How many successful payments did we take each week, and what was the average payment size?',
            possible: true,
        },
        {
            id: 'stripe-q-4',
            question:
                'What share of payment attempts failed last month, split by card brand?',
            possible: true,
        },
        {
            id: 'stripe-q-5',
            question: 'What were the top decline reasons in the last 30 days?',
            possible: true,
        },
        {
            id: 'stripe-q-6',
            question:
                'How much did we refund each month, and what was the refund rate against volume?',
            possible: true,
        },
        {
            id: 'stripe-q-7',
            question:
                'How many disputes did we get this quarter, how much money was at stake, and how many did we win?',
            possible: true,
        },
        {
            id: 'stripe-q-8',
            question: 'How much did we pay Stripe in fees each month?',
            possible: true,
        },
        {
            id: 'stripe-q-9',
            question:
                'How much was paid out to our bank each month, and how many payouts failed?',
            possible: true,
        },
        {
            id: 'stripe-q-10',
            question:
                'For a given payout, what charges, refunds and fees make it up?',
            possible: true,
        },
        {
            id: 'stripe-q-11',
            question:
                'Export every individual charge from last month, millions of rows, to reconcile line by line against our ledger.',
            possible: false,
        },
        {
            id: 'stripe-q-12',
            question:
                'What is our available and pending balance in each currency right now?',
            possible: false,
        },
        {
            id: 'stripe-q-13',
            question: 'How has MRR grown month by month over the last year?',
            possible: true,
        },
        {
            id: 'stripe-q-14',
            question:
                'How much MRR came from new, expansion, contraction and churned subscriptions each month?',
            possible: true,
        },
        {
            id: 'stripe-q-15',
            question: 'How many active subscriptions do we have on each plan?',
            possible: true,
        },
        {
            id: 'stripe-q-16',
            question:
                'What was our monthly customer churn rate over the last year?',
            possible: false,
        },
        {
            id: 'stripe-q-17',
            question:
                'What share of trials converted to paid subscriptions each month?',
            possible: false,
        },
        {
            id: 'stripe-q-18',
            question:
                'How much revenue did each product and price bring in last quarter?',
            possible: false,
        },
        {
            id: 'stripe-q-19',
            question: 'How is revenue split by customer country?',
            possible: false,
        },
        {
            id: 'stripe-q-20',
            question: 'Who are our 20 biggest customers by total amount paid?',
            possible: true,
        },
        {
            id: 'stripe-q-21',
            question: 'What is average revenue per paying customer each month?',
            possible: true,
        },
        {
            id: 'stripe-q-22',
            question: 'How much is outstanding in open and past-due invoices?',
            possible: false,
        },
        {
            id: 'stripe-q-23',
            question:
                'How much of each open invoice is 30, 60 and 90 or more days overdue?',
            possible: false,
        },
        {
            id: 'stripe-q-24',
            question:
                'Of invoices whose first payment attempt failed, how many were eventually paid?',
            possible: false,
        },
        {
            id: 'stripe-q-25',
            question:
                'How does revenue retention look by customer signup cohort?',
            possible: false,
        },
        {
            id: 'stripe-q-26',
            question: 'What is the average customer lifetime value by plan?',
            possible: false,
        },
        {
            id: 'stripe-q-27',
            question:
                'How much revenue was recognised versus deferred each month?',
            possible: false,
        },
        {
            id: 'stripe-q-28',
            question: 'How many payments have succeeded in the last hour?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'stripe-d-1',
            name: 'Payments overview',
            purpose:
                "Finance and ops check daily that money is coming in and payments aren't failing.",
            charts: [
                {
                    id: 'stripe-d-1-c-1',
                    title: 'Gross volume',
                    detail: 'Successful charge amount by day, last 90 days',
                    possible: true,
                },
                {
                    id: 'stripe-d-1-c-2',
                    title: 'Payment success rate',
                    detail: 'Succeeded over all charges by week',
                    possible: true,
                },
                {
                    id: 'stripe-d-1-c-3',
                    title: 'Refunds and disputes',
                    detail: 'Refunded and disputed amounts by month',
                    possible: true,
                },
                {
                    id: 'stripe-d-1-c-4',
                    title: 'Volume by payment method',
                    detail: 'Charge amount by payment method type',
                    possible: true,
                },
            ],
        },
        {
            id: 'stripe-d-2',
            name: 'Subscription health',
            purpose:
                'Founders and revenue ops track recurring revenue growth and where it leaks.',
            charts: [
                {
                    id: 'stripe-d-2-c-1',
                    title: 'MRR',
                    detail: 'Running total of MRR changes by month',
                    possible: true,
                },
                {
                    id: 'stripe-d-2-c-2',
                    title: 'MRR movements',
                    detail: 'New, expansion, contraction and churn MRR by month',
                    possible: true,
                },
                {
                    id: 'stripe-d-2-c-3',
                    title: 'Active subscriptions by plan',
                    detail: 'Active subscription count by price',
                    possible: true,
                },
                {
                    id: 'stripe-d-2-c-4',
                    title: 'Customer churn rate',
                    detail: 'Customers lost over customers at start of month',
                    possible: false,
                },
            ],
        },
        {
            id: 'stripe-d-3',
            name: 'Payouts and reconciliation',
            purpose:
                'Finance closes the month by matching Stripe activity to bank deposits.',
            charts: [
                {
                    id: 'stripe-d-3-c-1',
                    title: 'Payouts by month',
                    detail: 'Payout amount and count by arrival month',
                    possible: true,
                },
                {
                    id: 'stripe-d-3-c-2',
                    title: 'Payout composition',
                    detail: 'Charges, refunds, fees and net per payout',
                    possible: true,
                },
                {
                    id: 'stripe-d-3-c-3',
                    title: 'Fees by type',
                    detail: 'Stripe fees by reporting category by month',
                    possible: true,
                },
                {
                    id: 'stripe-d-3-c-4',
                    title: 'Charge-level ledger',
                    detail: 'Every charge with its payout, for line-by-line matching at millions of rows',
                    possible: false,
                },
            ],
        },
        {
            id: 'stripe-d-4',
            name: 'Customers and revenue',
            purpose:
                'Growth and leadership see who pays, where they are and how long they stay.',
            charts: [
                {
                    id: 'stripe-d-4-c-1',
                    title: 'Top customers',
                    detail: 'Top 20 customers by amount paid',
                    possible: true,
                },
                {
                    id: 'stripe-d-4-c-2',
                    title: 'Revenue by country',
                    detail: 'Paid invoice total by customer country',
                    possible: false,
                },
                {
                    id: 'stripe-d-4-c-3',
                    title: 'ARPU',
                    detail: 'Revenue over distinct paying customers by month',
                    possible: true,
                },
                {
                    id: 'stripe-d-4-c-4',
                    title: 'Cohort retention',
                    detail: 'Revenue retained by signup month cohort',
                    possible: false,
                },
            ],
        },
    ],
};

export const stripeSpec: LiveIntegrationSpec = {
    auth: {
        description:
            'No vendor review for a restricted key with Data > Queries > Read. Sandboxes run queries free; live query runs are free until 31 January 2027, then usage-priced, and may need a Sigma subscription.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'needs_review',
    },
    useCases: stripeUseCases,
};
