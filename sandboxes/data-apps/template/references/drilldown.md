# `drillDown()` API reference

> Read this when adding drill-down actions beyond the basic pattern shown in the action-menu example.

`drillDown()` builds a new query from a clicked row. Import it alongside `query` and `useLightdash`:

```ts
import { query, useLightdash, drillDown } from '@lightdash/query-sdk';
```

### API

```ts
drillDown({
    sourceQuery,   // The QueryBuilder that produced the clicked data
    metric,        // Which metric to drill into (string)
    dimension,     // Which dimension to drill by (string)
    row,           // The clicked row from useLightdash data
    label,         // Optional label for query inspector
}) // → QueryBuilder
```

**Do not pass a `label`** — the default label is automatically prefixed with `[Drill down]` (e.g., `[Drill down] total_revenue by order_date`), which makes drill queries easy to identify in the query inspector.

The returned `QueryBuilder` has:
- The drill-by dimension as the sole dimension
- The drilled metric
- Equality filters from every dimension value in the clicked row
- All existing filters from the source query preserved

Pass the result to `useLightdash()` to execute it.

### Choosing the drill dimension

Pick a dimension that gives meaningful detail for the metric:
- Revenue by month → drill by day or by product
- Total by segment → drill by individual customer
- Summary by region → drill by city

The agent decides the drill dimension at build time from the dbt YAML. For user-selectable drill dimensions, use a `<Select>` populated with dimension options:

```tsx
const [drillDim, setDrillDim] = useState('order_date');
// In the menu item onClick:
setDrillQuery(drillDown({ sourceQuery, metric: 'total_revenue', dimension: drillDim, row }));
```

### Displaying drill results

**Always show the filtered value in the dialog title** — e.g., "Revenue for Enterprise" or "Orders for 2024-01". This tells the user what they clicked. Store both the drill query and a descriptive title together in state (as `{ query, title }`).

Show drill results in a `Dialog`. Use a separate component so `useLightdash` runs only when the dialog is open:

```tsx
function DrillResults({ query: q }) {
    const { data, columns, format, loading, error } = useLightdash(q);

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (error) return <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>;
    if (data.length === 0) return <p className="text-sm text-muted-foreground">No results</p>;

    return (
        <ScrollArea className="max-h-[400px]">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col) => <TableHead key={col.name}>{col.label}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, i) => (
                        <TableRow key={i}>
                            {columns.map((col) => (
                                <TableCell key={col.name}>{formatField(row, col, format, 'cell')}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>
    );
}
```
