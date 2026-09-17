# Ordered custom chart inputs

A reference custom chart type that displays multiple grouping fields and measures in
exactly the order supplied by `useVizContext().fieldMapping`. Each measure has a
numeric bar so changes are visible in the rendered result as well as the controls.

## Use in a chart type

Create a custom chart type with `lightdash apps create "Ordered fields demo" --chart-type`,
or download an existing editable chart type. Copy
`src/App.jsx` and `src/chart.css` into its source directory. Set its
`lightdash-app.yml` `vizSchema` to the contents of `viz-schema.json`, then follow
the scaffold's validate → upload → verify instructions. Use a server and query SDK
that support `viz-multiple-fields`.

The declaration uses two inputs:

```json
[
    {
        "name": "groups",
        "label": "Grouping fields",
        "type": "dimension",
        "required": true,
        "multiple": true
    },
    {
        "name": "values",
        "label": "Measures",
        "type": "metric",
        "required": true,
        "multiple": true
    }
]
```

For the seeded Jaffle shop `orders` explore, select:

- Dimensions: Status, Order source.
- Metrics: Total order amount, Average order size, Unique order count.

Run the query, select this chart type, and open **Configure → General**. Add fields
with the input selector; move them with the up/down buttons and remove them with
×. The rendered columns follow the selected order, independently of query column
order. A removed field returns at the end when re-added. Empty required inputs
show setup guidance until a field is selected again.

Save the chart, reload it, then enter **Edit chart → Configure** to verify the same
bindings and order. To exercise a compatible upgrade, upload a new version with a
new text option while keeping the `groups` and `values` inputs unchanged. Apply
the upgrade from the chart configuration panel and save; the input order remains.

Existing inputs without `multiple: true` continue to use string bindings. The
array declaration is also supported in registry manifests and app-as-code;
saved chart-as-code mappings store the arrays directly.

## Verification screenshots

Captured in the explorer with live seeded query results:

- [Two dimensions and three metrics](screenshots/01-configured.jpg).
- [Reordered inputs and matching rendered columns](screenshots/02-reordered.jpg).
- [Saved, reopened chart after a compatible version upgrade](screenshots/03-reopened-after-upgrade.jpg).
- [Existing single-field chart and scalar controls](screenshots/04-single-field-compatibility.jpg).

The upgrade verification retained `groups: [order_source, status]` and
`values: [unique_order_count, average_order_size, total_order_amount]` (all with
`orders_` prefixes) in the persisted chart config and in the rendered column order.
