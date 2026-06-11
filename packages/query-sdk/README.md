# @lightdash/query-sdk

A React SDK for building custom data apps against the Lightdash semantic layer.

## Quick start

```tsx
import {
    createClient,
    LightdashProvider,
    useLightdash,
} from '@lightdash/query-sdk';

const lightdash = createClient();

function App() {
    return (
        <LightdashProvider client={lightdash}>
            <Dashboard />
        </LightdashProvider>
    );
}

function Dashboard() {
    const { data, loading, error } = useLightdash(
        lightdash
            .model('orders')
            .dimensions(['customer_segment'])
            .metrics(['total_revenue', 'order_count'])
            .filters([
                {
                    field: 'order_date',
                    operator: 'inThePast',
                    value: 90,
                    unit: 'days',
                },
            ])
            .sorts([{ field: 'total_revenue', direction: 'desc' }])
            .limit(10),
    );

    if (loading) return <p>Loading...</p>;
    if (error) return <p>Error: {error.message}</p>;

    return (
        <ul>
            {data.map((row, i) => (
                <li key={i}>
                    {row.customer_segment}: {row.total_revenue}
                </li>
            ))}
        </ul>
    );
}
```

Result rows are flat objects with raw typed values (numbers are numbers, strings are strings).

## Authentication

The SDK reads credentials from env vars. For Vite projects, add a `.env` file:

```
VITE_LIGHTDASH_API_KEY=your-pat-token
VITE_LIGHTDASH_URL=https://app.lightdash.cloud
VITE_LIGHTDASH_PROJECT_UUID=your-project-uuid
```

For Node/E2B environments, use unprefixed names (`LIGHTDASH_API_KEY`, etc.).

Calling `createClient()` with no arguments reads from env vars. You can also pass config explicitly:

```ts
const lightdash = createClient({
    apiKey: token,
    baseUrl: 'https://app.lightdash.cloud',
    projectUuid: 'uuid',
});
```

## Query builder

Queries are built with a chainable, immutable API. Fields use short names (e.g. `driver_name`), and the SDK qualifies them automatically for the API.

```ts
lightdash
    .model('orders')
    .dimensions(['customer_name', 'order_date'])
    .metrics(['total_revenue', 'order_count'])
    .filters([
        { field: 'status', operator: 'equals', value: 'completed' },
        { field: 'amount', operator: 'greaterThan', value: 1000 },
        { field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' },
    ])
    .sorts([{ field: 'total_revenue', direction: 'desc' }])
    .limit(100);
```

Supported filter operators: `equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `inThePast`, `notInThePast`, `inTheNext`, `inTheCurrent`, `notInTheCurrent`, `inBetween`, `notInBetween`, `isNull`, `notNull`, `startsWith`, `endsWith`, `include`, `doesNotInclude`.

## Parameters

Lightdash parameters (`${lightdash.parameters.X}` substitutions) let a query swap out
pieces of SQL at runtime — for example a comparison-mode dropdown that switches a
year-over-year window between `YTD` and `Last 12 Months`.

Parameters must be declared in `lightdash.yml` / model YAML and referenced via
`${lightdash.parameters.X}` in SQL. Pass values at query time with `.parameters()`:

```tsx
function YoYChart() {
    const [mode, setMode] = useState('YTD');

    const { data } = useLightdash(
        lightdash
            .model('orders')
            .metrics(['revenue_current', 'revenue_previous'])
            .parameters({ comparison_mode: mode }),
    );

    // Changing `mode` produces a new query whose cache key includes the
    // parameter value, so results re-fetch and the Current / Previous
    // figures update for the selected window.
    return (
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="YTD">Year to date</option>
            <option value="L12M">Last 12 months</option>
        </select>
    );
}
```

`.parameters()` is immutable and merges with prior calls (later keys win). Values can be
strings, numbers, or arrays of either. They are sent at the top level of the API request.

## Results

`useLightdash(query)` returns:

| Field     | Type            | Description                                                      |
| --------- | --------------- | ---------------------------------------------------------------- |
| `data`    | `Row[]`         | Array of flat objects. Numbers are numbers, strings are strings. |
| `loading` | `boolean`       | True while the query is running.                                 |
| `error`   | `Error \| null` | Error if the query failed.                                       |
| `refetch` | `() => void`    | Re-run the query.                                                |

## User context

```ts
const user = await lightdash.auth.getUser();
// { name: 'John Doe', email: '...', role: 'admin', orgId: '...', attributes: {} }
```

## How it works

1. `createClient()` sets up auth and the API transport
2. `<LightdashProvider>` makes the transport available to hooks via React context
3. `useLightdash(query)` posts to the async metric query endpoint, polls for results, and returns flat rows
4. Field IDs are auto-qualified (`driver_name` becomes `fct_race_results_driver_name` for the API)

## Development

```bash
pnpm -F query-sdk typecheck    # type check
pnpm -F query-sdk lint          # lint
pnpm -F query-sdk fix-format    # format with oxfmt
```

See `example/` for a working F1 dashboard demo.
