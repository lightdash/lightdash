
# Adding dimensions to Lightdash

**Dimensions** are fields that are used to **segment data** from your Tables.

If you're completely new to Lightdash, we'd recommend checking out our Tutorial on [creating your first dimensions and metrics in Lightdash](/get-started/setup-lightdash/add-metrics).

## Adding dimensions to your project

Dimensions are created automatically when you define columns in your dbt model properties. To define columns add a
new `.yml` file to your `models/` directory in your dbt project.

For example, the following dbt project file contains properties that create a single dimension, `status`, for the `orders` model in Lightdash:

```yaml
version: 2
models:
  - name: orders
    description: "A table of all orders."
    columns:
      - name: status
        description: "Status of an order: ordered/processed/complete"
```

The name of the dimension is `status` and the type will be inferred from the column in your database.

:::info

There are some pretty great tools for automatically generating and updating your model .yml files in dbt. To read more about how to do this, check out or docs on [adding Tables to Lightdash](/guides/adding-tables-to-lightdash.mdx#how-to-create--update-yml-files)

:::
