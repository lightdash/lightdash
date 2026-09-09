import { type PlaygroundContent } from '../../packages/backend/src/ee/services/ProjectService/playgroundContentTypes';

/** Editable teaching samples included whenever the playground bundle is rebuilt. */
export const teachingContent = {
    pinned: {
        dashboards: ['jaffle-shop-overview'],
    },
    comments: [
        {
            chartKey: 'orders-over-time',
            text: 'The spike at the start of 2025 is the winter promo. Worth checking how many of those were first orders.',
        },
    ],
    categories: [
        {
            yamlReference: 'sales',
            name: 'Sales',
            color: 'blue',
        },
        {
            yamlReference: 'revenue_growth',
            name: 'Revenue growth',
            color: 'green',
        },
        {
            yamlReference: 'core',
            name: 'Core',
            color: 'violet',
        },
        {
            yamlReference: 'experimental',
            name: 'Experimental',
            color: 'orange',
        },
        {
            name: 'Weekly review',
            color: 'pink',
        },
    ],
    dataApps: [
        {
            key: 'jaffle-pulse',
            slug: 'jaffle-pulse',
            name: 'Jaffle pulse',
            description:
                'A one-page view of the jaffle shop: orders, revenue and where they stand.',
            prompt: "A one-page app with the jaffle shop's order count, revenue and customers, and a bar list of orders by status.",
            files: {
                'index.html':
                    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Jaffle pulse</title>\n<style>\n  :root { color-scheme: light; }\n  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f7f7f5; color: #1f2933; }\n  main { max-width: 880px; margin: 0 auto; padding: 32px 24px; }\n  h1 { font-size: 22px; margin: 0 0 4px; }\n  p.lead { margin: 0 0 24px; color: #52606d; }\n  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }\n  .card { background: #fff; border: 1px solid #e4e7eb; border-radius: 10px; padding: 18px; }\n  .card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #7b8794; }\n  .card .value { font-size: 28px; font-weight: 600; margin-top: 6px; }\n  .card .delta { font-size: 12px; color: #2f855a; margin-top: 4px; }\n  .bars { margin-top: 28px; background: #fff; border: 1px solid #e4e7eb; border-radius: 10px; padding: 18px; }\n  .bars h2 { font-size: 14px; margin: 0 0 12px; color: #52606d; }\n  .row { display: grid; grid-template-columns: 110px 1fr 48px; align-items: center; gap: 12px; margin: 8px 0; font-size: 13px; }\n  .bar { height: 10px; background: #e4e7eb; border-radius: 5px; overflow: hidden; }\n  .bar span { display: block; height: 100%; background: #7048e8; }\n  .count { text-align: right; color: #52606d; }\n</style>\n</head>\n<body>\n<main>\n  <h1>Jaffle pulse</h1>\n  <p class="lead">A one-page view of the jaffle shop: orders, revenue and where they stand.</p>\n  <section class="grid">\n    <div class="card"><div class="label">Orders</div><div class="value">129</div><div class="delta">All time</div></div>\n    <div class="card"><div class="label">Revenue</div><div class="value">$2,420</div><div class="delta">Completed orders</div></div>\n    <div class="card"><div class="label">Customers</div><div class="value">62</div><div class="delta">With an order</div></div>\n  </section>\n  <section class="bars">\n    <h2>Orders by status</h2>\n    <div class="row"><div>Completed</div><div class="bar"><span style="width:75%"></span></div><div class="count">97</div></div>\n    <div class="row"><div>Shipped</div><div class="bar"><span style="width:20%"></span></div><div class="count">26</div></div>\n    <div class="row"><div>Returned</div><div class="bar"><span style="width:3%"></span></div><div class="count">4</div></div>\n    <div class="row"><div>Return pending</div><div class="bar"><span style="width:2%"></span></div><div class="count">2</div></div>\n  </section>\n</main>\n</body>\n</html>\n',
            },
            source: {
                'src/App.tsx':
                    "// Jaffle pulse: a static one-page view of the jaffle shop's orders,\n// built ahead of time for the training project so no build runs.\nexport default function App() {\n    return (\n        <main>\n            <h1>Jaffle pulse</h1>\n            <p>A one-page view of the jaffle shop: orders, revenue and where they stand.</p>\n        </main>\n    );\n}\n",
            },
        },
    ],
    agent: {
        name: 'Jaffle analyst',
        slug: 'jaffle-analyst',
        description:
            'Answers questions about the jaffle shop: customers, orders and payments.',
        instruction:
            'You are the analyst for a jaffle shop. Answer questions about customers, orders and payments from the orders, customers and payments tables. Prefer a chart when a trend or comparison is asked for, and say which table the answer came from.',
    },
    deepResearch: {
        prompt: 'Why did returns rise in the spring, and what did the returned orders have in common?',
        threadTitle: 'Why returns rose in the spring',
        resultMarkdown:
            '# Why returns rose in the spring\n\nReturns climbed through the spring while order volume stayed flat. This report looks at which orders came back, when, and what the returned orders had in common.\n\n## Returns grew faster than orders\n\nOrders held steady month over month, but returned and return-pending orders rose from a handful in winter to a visible share of spring orders. The rise is not explained by more orders being placed.\n\n## Returned orders skew to larger baskets\n\nReturned orders carried a higher average amount than completed orders. Bigger baskets came back more often, which points at fulfilment or expectation problems on larger orders rather than a product-wide issue.\n\n## Coupon orders were not the cause\n\nOrders paid with a coupon returned at the same rate as orders paid by card or bank transfer. Discounting did not drive the returns.\n\n## Conclusion\n\nReturns rose in the spring because larger orders came back more often, not because more orders were placed or because of coupons. The next step is to look at delivery speed for large orders, which this data does not yet cover.\n',
        durationMs: 412000,
        warehouseQueryCount: 9,
    },
} satisfies Pick<
    PlaygroundContent,
    'pinned' | 'comments' | 'categories' | 'dataApps' | 'agent' | 'deepResearch'
>;
