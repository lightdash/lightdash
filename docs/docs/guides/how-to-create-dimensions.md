---
sidebar_position: 1
---

# How to create dimensions

**Dimensions in Lightdash come from the columns defined in your dbt project**

## Declare columns in your dbt projects

Once you've launched your Lightdash project you should be able to see a list of all of the models from your connected dbt project.

![screenshot-tables-view](assets/screenshot-tables-view.png)

If you click on any of the models within your Lightdash project, you'll see the dimensions and metrics for that model listed on the left side.

The dimensions you see in Lightdash are the columns that you've defined in your model's dbt YAML file. If you include descriptions for your columns, these will be pulled into Lightdash automatically!

:::info

For a dimension to appear in Lightdash, you need to declare it as a column in your YAML file.

:::

```yaml
version: 2

models:
  - name: users
    description: "One row per user_id. This is a list of all users and aggregated information for these users."
    columns:
      - name: user_id
        description: 'Unique identifier for a user.'
```

![screenshot-dimension-info](assets/screenshot-dimension-info.png)

## Next steps

* Check out the [dimension reference](../references/dimensions.md) to customize your dimensions.
* Dimensions are most useful when you also have metrics: [how to create a metric](how-to-create-metrics).
