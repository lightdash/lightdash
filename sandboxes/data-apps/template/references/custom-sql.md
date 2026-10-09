# Custom SQL in data apps

Prefer existing modelled metrics and dimensions with the required business meaning. When custom SQL is necessary, use literal SQL strings and literal `table` and explore names, or simple constants that resolve to those strings. Define fields as plain objects in arrays. Named constants, imported constants, and spreads of literal arrays are supported; definitions do not have to be directly inline.

Lightdash records the exact SQL from each app version to authorize registered viewers who can access the app. The extractor does not execute JavaScript. Do not construct SQL or field definitions through helper factories, `.map()`, string concatenation, or interpolated template literals. Keep SQL fixed and use SDK filters or declared Lightdash parameters for interactive values. Never interpolate user input into SQL.

## Supported example

```ts
import { query } from '@lightdash/query-sdk';

const EXPLORE = 'orders';
const EXTRA_METRICS = [{
    name: 'completed_count',
    label: 'Completed orders',
    table: 'orders',
    type: 'sum',
    sql: "CASE WHEN ${orders.status} = 'completed' THEN 1 ELSE 0 END",
}];

query(EXPLORE)
    .label('Completed orders by status')
    .dimensions(['status_label'])
    .metrics(['completed_count'])
    .additionalMetrics(EXTRA_METRICS)
    .customDimensions([{
        id: 'orders_status_label',
        name: 'Status',
        table: 'orders',
        type: 'sql',
        dimensionType: 'string',
        sql: 'UPPER(${orders.status})',
    }])
    .tableCalculations([{
        name: 'share',
        displayName: 'Share of completed orders',
        sql: '1.0 * ${orders.completed_count} / NULLIF(SUM(${orders.completed_count}) OVER (), 0)',
    }]);
```

Here `${orders.status}` is part of a literal SQL string, not JavaScript interpolation. Use the existing modelled completed-order metric instead if one matches; the custom metric above illustrates the fallback only.

Custom dimension IDs must match the SDK's qualified selection: `.dimensions(['status_label'])` on `query('orders')` selects `orders_status_label`, so use that full value for the definition's `id`. The returned row still uses the selected short name, `status_label`.

## Unsupported example — rewrite before completing the build

```ts
import { query } from '@lightdash/query-sdk';

const EXPLORE = 'orders';
const METRIC = 'order_count';
const sumWhen = (name, condition) => ({
    name, table: EXPLORE, type: 'sum',
    sql: `CASE WHEN ${condition} THEN 1 ELSE 0 END`,
});

query(EXPLORE)
    .additionalMetrics([sumWhen('completed_count', "${orders.status} = 'completed'")])
    .tableCalculations([{
        name: 'share', displayName: 'Share',
        sql: `\${${EXPLORE}.${METRIC}} / SUM(\${${EXPLORE}.${METRIC}}) OVER ()`,
    }]);
```

Rewrite these as literal field definitions and SQL strings, preserving their calculation and filter semantics. Do not remove a requested calculation, change its denominator, or move it into client-side JavaScript merely to satisfy extraction. The pipeline provides source locations when it cannot capture custom SQL; fix those definitions in place.
