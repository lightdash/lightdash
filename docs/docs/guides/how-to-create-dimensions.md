
# Adding dimensions to Lightdash

**Dimensions** are fields that are used to **segment data** from your Tables.

If you're completely new to Lightdash, we'd recommend checking out our Tutorial on [creating your first dimensions and metrics in Lightdash](/get-started/setup-lightdash/add-metrics) to learn a bit more about dimensions, metrics, and how to use them in Lightdash.

## Adding dimensions to your project

### Lightdash dimensions are added in your dbt project's .yml files

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

## Configuring your dimensions

You can jazz up your dimensions by configuring them in your .yml files. These dimension configurations live under the `meta` tag of your columns:

```yaml
version: 2
models:
  - name: orders
    description: "A table of all orders."
    columns:
      - name: status
        description: "Status from org256 settings codes. Referenced at 
        delivery from stat5 zone."
        meta:
          dimension:
            label: "Status latest"
            description: "Status of an order: ordered/processed/complete"
            ...etc
```

Things like the format, the label that people see in Lightdash, rounding, etc. - these are all configurations that you can apply to your dimensions.

You can [see all of the dimension configurations in our dimensions docs here](/references/dimensions.md#dimension-configuration).

## Syncing dimensions in Lightdash

Once you've added your dimensions, you'll want to re-sync your Lightdash project by clicking on `refresh dbt`.

Not sure what `refresh dbt` is? Check out our guide on [syncing your dbt changes here](/references/syncing_your_dbt_changes.md).
