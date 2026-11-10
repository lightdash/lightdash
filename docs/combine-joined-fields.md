# Combined explore fields

`combine_joined_fields` controls how an explore's field sidebar is organized.
It defaults to `false`. When enabled, visible base-table and joined-table fields
share Dimensions and Metrics sections, with matching field group paths combined.
Custom metrics and custom dimensions keep their own sections.

```yaml
models:
  - name: users
    config:
      meta:
        combine_joined_fields: true
        joins:
          - join: user_purchase_summary
            sql_on: ${users.user_id} = ${user_purchase_summary.user_id}
            relationship: one-to-one
        explores:
          users_by_table:
            combine_joined_fields: false
```

Named explores inherit the base model's setting and can explicitly override it
with either boolean value. Native Lightdash model YAML accepts the same setting
at the model root and under `explores`. Recompile the project after changing it.

Groups match by their complete configured key path, rather than their display
labels. The base table's `group_details` takes precedence; missing definitions
are filled from visible joined tables in join order. Legacy field `group_label`
values also combine. Generated date interval groups remain table-qualified.

The base model's `order_fields_by` controls the combined view. Index ordering
places base fields first, followed by each join's fields in their declared order.
Duplicate field labels show source-table labels; aliased tables with the same
label also show their alias. Field hover details always expose the source table.

This changes presentation only. Original field IDs, SQL, metric ownership, join
field restrictions, and visibility rules remain unchanged. No database migration
or saved-chart update is required. The main explore and merge-query sidebars use
the same field tree and respect this setting.
