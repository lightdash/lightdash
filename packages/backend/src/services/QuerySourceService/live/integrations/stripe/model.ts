import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    type LiveExploreDefinition,
    type LiveModel,
} from '../../sdk';

// Each explore reads one table of Stripe's analytical dataset, the same data
// Sigma queries. Only columns Stripe's data docs show are used. The queries
// are SQL, so every operator below compiles; dates are ordinary filters.

export const STRIPE_NULL_FILTERS = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const STRIPE_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...STRIPE_NULL_FILTERS,
];

export const STRIPE_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    ...STRIPE_NULL_FILTERS,
];

export const STRIPE_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
    ...STRIPE_NULL_FILTERS,
];

export const STRIPE_BOOLEAN_FILTERS = [
    FilterOperator.EQUALS,
    ...STRIPE_NULL_FILTERS,
];

export const STRIPE_FILTERS_BY_TYPE: Record<DimensionType, FilterOperator[]> = {
    [DimensionType.STRING]: STRIPE_STRING_FILTERS,
    [DimensionType.NUMBER]: STRIPE_NUMBER_FILTERS,
    [DimensionType.DATE]: STRIPE_DATE_FILTERS,
    [DimensionType.TIMESTAMP]: STRIPE_DATE_FILTERS,
    [DimensionType.BOOLEAN]: STRIPE_BOOLEAN_FILTERS,
};

// Metrics filter as numbers; a metric is never null
export const STRIPE_METRIC_FILTERS = STRIPE_NUMBER_FILTERS.filter(
    (operator) => !STRIPE_NULL_FILTERS.includes(operator),
);

// Stripe stores amounts in the currency's smallest unit: cents, but whole
// yen, and thousandths for three-decimal currencies
// (https://docs.stripe.com/currencies#special-cases).
const ZERO_DECIMAL_CURRENCIES = [
    'bif',
    'clp',
    'djf',
    'gnf',
    'jpy',
    'kmf',
    'krw',
    'mga',
    'pyg',
    'rwf',
    'ugx',
    'vnd',
    'vuv',
    'xaf',
    'xof',
    'xpf',
];
const THREE_DECIMAL_CURRENCIES = ['bhd', 'jod', 'kwd', 'omr', 'tnd'];

const toSqlList = (values: string[]) =>
    values.map((value) => `'${value}'`).join(', ');

/** SQL for an amount column in the currency's main unit, as Stripe's dashboard shows it. */
export const toMajorUnits = (column: string) =>
    `CAST(\${TABLE}.${column} AS DOUBLE) / CASE` +
    ` WHEN lower(\${TABLE}.currency) IN (${toSqlList(ZERO_DECIMAL_CURRENCIES)}) THEN 1` +
    ` WHEN lower(\${TABLE}.currency) IN (${toSqlList(THREE_DECIMAL_CURRENCIES)}) THEN 1000` +
    ` ELSE 100 END`;

const AMOUNT_HINT =
    'In the currency of each row: group or filter by Currency, never add amounts across currencies.';

const DEFAULT_DAYS = 90;
const DATE_HINT = `Without a date filter the query reads the last ${DEFAULT_DAYS} days. Stripe's analytical data trails live activity by up to a few hours.`;

// Each table has one row per Stripe object, so sums and row counts add
// across groups; averages and distinct counts don't.

export const STRIPE_CHARGES_EXPLORE: LiveExploreDefinition = {
    name: 'charges',
    label: 'Charges',
    description:
        'Every payment attempt in Stripe, successful or not, with its payment method, card and failure reason. Amounts are in each charge’s currency.',
    aiHint: `${DATE_HINT} Gross volume is Amount with Status succeeded. ${AMOUNT_HINT}`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'created',
            label: 'Charge date',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Day the charge was created, in UTC.',
            sql: 'CAST(${TABLE}.created AS DATE)',
        }),
        dimension({
            name: 'week',
            apiName: 'created',
            label: 'Charge week',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Week the charge was created, shown as its Monday.',
            sql: "CAST(date_trunc('week', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'month',
            apiName: 'created',
            label: 'Charge month',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Month the charge was created, shown as its first day.',
            sql: "CAST(date_trunc('month', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'created',
            label: 'Charge time',
            type: DimensionType.TIMESTAMP,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Exact time the charge was created, in UTC.',
        }),
        dimension({
            name: 'id',
            label: 'Charge ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the charge, starting ch_ or py_.',
        }),
        dimension({
            name: 'status',
            label: 'Status',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'succeeded, pending or failed.',
        }),
        dimension({
            name: 'paid',
            label: 'Paid',
            type: DimensionType.BOOLEAN,
            filterOperators: STRIPE_BOOLEAN_FILTERS,
            description:
                'True when the charge succeeded or was authorized for later capture.',
        }),
        dimension({
            name: 'currency',
            label: 'Currency',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Three-letter ISO currency code, in lowercase, such as usd.',
        }),
        dimension({
            name: 'payment_method_type',
            label: 'Payment method type',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Type of payment method, such as card or sepa_debit.',
        }),
        dimension({
            name: 'card_brand',
            label: 'Card brand',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Card network, such as Visa or MasterCard.',
        }),
        dimension({
            name: 'card_country',
            label: 'Card country',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Two-letter country code of the card issuer.',
        }),
        dimension({
            name: 'failure_code',
            label: 'Failure code',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Why the charge failed, such as card_declined; empty for successful charges.',
        }),
        dimension({
            name: 'customer_id',
            label: 'Customer ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the customer charged, starting cus_.',
        }),
        dimension({
            name: 'disputed',
            apiName: 'dispute_id',
            label: 'Disputed',
            type: DimensionType.BOOLEAN,
            filterOperators: STRIPE_BOOLEAN_FILTERS,
            description: 'True when the customer disputed the charge.',
            sql: '(${TABLE}.dispute_id IS NOT NULL)',
        }),
    ],
    metrics: [
        metric({
            name: 'charge_count',
            label: 'Charges',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of payment attempts.',
            sql: '${TABLE}.id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'amount',
            label: 'Amount',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Total amount charged, in the main unit of the currency. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('amount'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'average_amount',
            label: 'Average amount',
            type: MetricType.AVERAGE,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Average amount per charge. Mixes currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('amount'),
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'customer_count',
            label: 'Customers',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of distinct customers charged.',
            aiHint: 'Distinct count: never sum rows.',
            sql: '${TABLE}.customer_id',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const STRIPE_BALANCE_TRANSACTIONS_EXPLORE: LiveExploreDefinition = {
    name: 'balance_transactions',
    label: 'Balance transactions',
    description:
        'Every movement of money on the Stripe balance: charges, refunds, disputes, fees and payouts, with the fee and net of each and the payout it settled in.',
    aiHint: `${DATE_HINT} Net volume is Net summed over every type except payout. Payouts are rows with Type payout; their amounts are negative. ${AMOUNT_HINT}`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'created',
            label: 'Transaction date',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Day the balance transaction was created, in UTC.',
            sql: 'CAST(${TABLE}.created AS DATE)',
        }),
        dimension({
            name: 'week',
            apiName: 'created',
            label: 'Transaction week',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Week the balance transaction was created, shown as its Monday.',
            sql: "CAST(date_trunc('week', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'month',
            apiName: 'created',
            label: 'Transaction month',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Month the balance transaction was created, shown as its first day.',
            sql: "CAST(date_trunc('month', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'id',
            label: 'Transaction ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the balance transaction, starting txn_.',
        }),
        dimension({
            name: 'type',
            label: 'Type',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'What moved the balance, such as charge, refund, adjustment, payout or stripe_fee.',
        }),
        dimension({
            name: 'reporting_category',
            label: 'Reporting category',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Stripe’s accounting grouping, such as charge, refund, dispute, fee or payout.',
        }),
        dimension({
            name: 'currency',
            label: 'Currency',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Three-letter ISO currency code, in lowercase, such as usd.',
        }),
        dimension({
            name: 'payout_id',
            apiName: 'automatic_transfer_id',
            label: 'Payout ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'The automatic payout this transaction was paid out in, starting po_.',
        }),
        dimension({
            name: 'source_id',
            label: 'Source ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'The charge, refund, dispute or other object that caused the transaction.',
        }),
    ],
    metrics: [
        metric({
            name: 'transaction_count',
            label: 'Transactions',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of balance transactions.',
            sql: '${TABLE}.id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'amount',
            label: 'Gross amount',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Gross amount before fees; negative for money leaving the balance. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('amount'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'fee',
            label: 'Fees',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Stripe fees charged. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('fee'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'net',
            label: 'Net amount',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Amount after fees; negative for money leaving the balance. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('net'),
            aggregation: ADDITIVE,
        }),
    ],
};

export const STRIPE_DISPUTES_EXPLORE: LiveExploreDefinition = {
    name: 'disputes',
    label: 'Disputes',
    description:
        'Chargebacks and inquiries customers opened with their bank, with reason and outcome.',
    aiHint: `${DATE_HINT} Won disputes have Status won, lost ones lost. ${AMOUNT_HINT}`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'created',
            label: 'Dispute date',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Day the dispute was opened, in UTC.',
            sql: 'CAST(${TABLE}.created AS DATE)',
        }),
        dimension({
            name: 'week',
            apiName: 'created',
            label: 'Dispute week',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Week the dispute was opened, shown as its Monday.',
            sql: "CAST(date_trunc('week', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'month',
            apiName: 'created',
            label: 'Dispute month',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Month the dispute was opened, shown as its first day.',
            sql: "CAST(date_trunc('month', ${TABLE}.created) AS DATE)",
        }),
        dimension({
            name: 'id',
            label: 'Dispute ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the dispute, starting du_.',
        }),
        dimension({
            name: 'charge_id',
            label: 'Charge ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The charge being disputed.',
        }),
        dimension({
            name: 'reason',
            label: 'Reason',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Reason given, such as fraudulent or product_not_received.',
        }),
        dimension({
            name: 'status',
            label: 'Status',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Where the dispute stands, such as needs_response, under_review, won or lost.',
        }),
        dimension({
            name: 'currency',
            label: 'Currency',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Three-letter ISO currency code, in lowercase, such as usd.',
        }),
    ],
    metrics: [
        metric({
            name: 'dispute_count',
            label: 'Disputes',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of disputes.',
            sql: '${TABLE}.id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'amount',
            label: 'Disputed amount',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Amount in dispute, in the main unit of the currency. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('amount'),
            aggregation: ADDITIVE,
        }),
    ],
};

export const STRIPE_MRR_CHANGES_EXPLORE: LiveExploreDefinition = {
    name: 'subscription_item_change_events',
    label: 'MRR changes',
    description:
        'Every change to a subscription item that moved monthly recurring revenue: starts, ends, upgrades, downgrades and quantity changes, each with its MRR change.',
    aiHint: `${DATE_HINT} MRR at a date is the running total of MRR change from the first event, so read from the start of the account for MRR levels. Event type splits new (ACTIVE_START), churned (ACTIVE_END), expansion (ACTIVE_UPGRADE, ACTIVE_QUANTITY_INCREASE) and contraction (ACTIVE_DOWNGRADE, ACTIVE_QUANTITY_DECREASE). ${AMOUNT_HINT}`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'event_timestamp',
            label: 'Event date',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Day the change happened, in UTC.',
            sql: 'CAST(${TABLE}.event_timestamp AS DATE)',
        }),
        dimension({
            name: 'week',
            apiName: 'event_timestamp',
            label: 'Event week',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Week the change happened, shown as its Monday.',
            sql: "CAST(date_trunc('week', ${TABLE}.event_timestamp) AS DATE)",
        }),
        dimension({
            name: 'month',
            apiName: 'event_timestamp',
            label: 'Event month',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Month the change happened, shown as its first day.',
            sql: "CAST(date_trunc('month', ${TABLE}.event_timestamp) AS DATE)",
        }),
        dimension({
            name: 'event_type',
            label: 'Event type',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'ACTIVE_START, ACTIVE_END, ACTIVE_UPGRADE, ACTIVE_DOWNGRADE, ACTIVE_QUANTITY_INCREASE or ACTIVE_QUANTITY_DECREASE.',
        }),
        dimension({
            name: 'currency',
            label: 'Currency',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Three-letter ISO currency code, in lowercase, such as usd.',
        }),
        dimension({
            name: 'product_id',
            label: 'Product ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The product subscribed to, starting prod_.',
        }),
        dimension({
            name: 'price_id',
            label: 'Price ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The price subscribed to, starting price_.',
        }),
        dimension({
            name: 'customer_id',
            label: 'Customer ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The subscribing customer, starting cus_.',
        }),
        dimension({
            name: 'subscription_id',
            label: 'Subscription ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The subscription that changed, starting sub_.',
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Changes',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of subscription item changes.',
            sql: '${TABLE}.subscription_item_id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'mrr_change',
            label: 'MRR change',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Change in monthly recurring revenue, in the main unit of the currency. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('mrr_change'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'quantity_change',
            label: 'Quantity change',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Change in subscribed quantity, such as seats.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const STRIPE_SUBSCRIPTIONS_EXPLORE: LiveExploreDefinition = {
    name: 'subscriptions',
    label: 'Subscriptions',
    description:
        'Subscriptions as they stand now, with their status and price.',
    aiHint: 'Current state only: for counts over time use MRR changes. Active subscriptions are those with Status active.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'id',
            label: 'Subscription ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the subscription, starting sub_.',
        }),
        dimension({
            name: 'status',
            label: 'Status',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Current status, such as trialing, active, past_due, unpaid or canceled.',
        }),
        dimension({
            name: 'price_id',
            label: 'Price ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The price subscribed to, starting price_.',
        }),
        dimension({
            name: 'customer_id',
            label: 'Customer ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The subscribing customer, starting cus_.',
        }),
    ],
    metrics: [
        metric({
            name: 'subscription_count',
            label: 'Subscriptions',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of subscriptions.',
            sql: '${TABLE}.id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'customer_count',
            label: 'Customers',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of distinct subscribing customers.',
            aiHint: 'Distinct count: never sum rows.',
            sql: '${TABLE}.customer_id',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const STRIPE_INVOICES_EXPLORE: LiveExploreDefinition = {
    name: 'invoices',
    label: 'Invoices',
    description:
        'Invoices Stripe Billing issued, with subtotal, tax and total for the period they bill.',
    aiHint: `Dated by the start of the billing period. Without a date filter the query reads the last 90 days. ${AMOUNT_HINT}`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'period_start',
            label: 'Period date',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description: 'Day the billing period started, in UTC.',
            sql: 'CAST(${TABLE}.period_start AS DATE)',
        }),
        dimension({
            name: 'week',
            apiName: 'period_start',
            label: 'Period week',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Week the billing period started, shown as its Monday.',
            sql: "CAST(date_trunc('week', ${TABLE}.period_start) AS DATE)",
        }),
        dimension({
            name: 'month',
            apiName: 'period_start',
            label: 'Period month',
            type: DimensionType.DATE,
            filterOperators: STRIPE_DATE_FILTERS,
            description:
                'Month the billing period started, shown as its first day.',
            sql: "CAST(date_trunc('month', ${TABLE}.period_start) AS DATE)",
        }),
        dimension({
            name: 'id',
            label: 'Invoice ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'Stripe ID of the invoice, starting in_.',
        }),
        dimension({
            name: 'currency',
            label: 'Currency',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description:
                'Three-letter ISO currency code, in lowercase, such as usd.',
        }),
        dimension({
            name: 'subscription_id',
            label: 'Subscription ID',
            type: DimensionType.STRING,
            filterOperators: STRIPE_STRING_FILTERS,
            description: 'The subscription billed, if any, starting sub_.',
        }),
    ],
    metrics: [
        metric({
            name: 'invoice_count',
            label: 'Invoices',
            type: MetricType.COUNT,
            filterOperators: STRIPE_METRIC_FILTERS,
            description: 'Number of invoices.',
            sql: '${TABLE}.id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'subtotal',
            label: 'Subtotal',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Amount before discounts and tax. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('subtotal'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'tax',
            label: 'Tax',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Tax on the invoice. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('tax'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'total',
            label: 'Total',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Subtotal less discounts, plus tax. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('total'),
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'amount_due',
            label: 'Amount due',
            type: MetricType.SUM,
            filterOperators: STRIPE_METRIC_FILTERS,
            description:
                'Amount the customer owes after credits. Adds up different currencies unless grouped or filtered by Currency.',
            aiHint: AMOUNT_HINT,
            sql: toMajorUnits('amount_due'),
            aggregation: ADDITIVE,
        }),
    ],
};
export const STRIPE_EXPLORES = [
    STRIPE_CHARGES_EXPLORE,
    STRIPE_BALANCE_TRANSACTIONS_EXPLORE,
    STRIPE_DISPUTES_EXPLORE,
    STRIPE_MRR_CHANGES_EXPLORE,
    STRIPE_SUBSCRIPTIONS_EXPLORE,
    STRIPE_INVOICES_EXPLORE,
] as const;

export const stripeModel: LiveModel<ApiConnectorType.STRIPE> = {
    explores: STRIPE_EXPLORES,
};
