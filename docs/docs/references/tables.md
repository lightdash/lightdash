---
sidebar_position: 2
---

# Tables reference sheet

You can run queries against the tables in your Lightdash project.

Tables are built from dbt models (either one, or many joined together).

---

## Adding Tables to your project

Tables come from dbt models that have been defined in your dbt project's schema.yml files.

If your dbt model has been defined in a .yml file, it will appear in Lightdash as a table.

For example, if we had this in our schema.yml files in dbt, we'd see a Table called `users` in Lightdash.

```yaml
version: 2

models:
  - name: users
```

You can read more about [adding Tables to Lightdash here](/guides/adding-tables-to-lightdash).

## Table configuration

You can customize your Tables in your dbt model's YAML file. Here's an example of the properties used in defining a Table:

```yaml
version: 2

models:
  - name: my_table
    meta:
      label: "My Custom Table Name"
      order_fields_by: "label"
      joins:
        - join: my_other_table
          sql_on: ${my_table.column_a} = ${my_other_table.column_a}
```

Here are all of the properties you can customize:

| Property                                          | Value              | Note                                                                                                      |
|---------------------------------------------------|--------------------|-----------------------------------------------------------------------------------------------------------|
| label                                             | string             | Custom label. This is what you'll see in Lightdash instead of the Table name.                             |
| [order_fields_by](#order-fields-by)               | 'index' or 'label' | How the fields will be sorted in the sidebar. [Read more about the order rules in here](#order-fields-by) |
| [joins](joins.md)                                 | array              | Join logic to join other data models to the Table. [Read more about joins in here.](joins.md)             |
| [metrics](metrics.mdx#2-using-the-model-meta-tag) | object             | Model metrics. [Read more about model metrics in here](metrics.mdx#2-using-the-model-meta-tag)            |

### If you've added a new dbt model to your project, you need to do `dbt run` + `dbt refresh` before it before it will appear in Lightdash

Lightdash gets information about your data models from dbt.
But it gets information about the data **_generated_** by those data models from your data warehouse.

This means that if you add a new dbt model to your project or update a model so that you're making changes
to the table it generates, then you need to do two things before your changes will appear in Lightdash:

1. **Materialize the new table/changes to the table (using `dbt run`).**
You basically want the data in your data warehouse to be the new
table you're expecting. So you need to do `dbt run` to update the table from the data model you just changed.  

2. **Click `dbt refresh` in Lightdash.**
This will re-sync your dbt project in Lightdash so that any changes you made
to your dbt models is shown in Lightdash (e.g. adding a new table).

### Order fields by

By default, the fields in your sidebar for any table will appear alphabetically (`order_fields_by: "label"`). Sometimes, you might not want your fields to appear alphabetically, but instead, in the same order as they are in your model's dbt .yml file. You can achieve this by setting the `order_fields_by` parameter in your table's meta tag to `index`, like this:

```yaml
version: 2

models:
  - name: my_table
    meta:
      order_fields_by: "index"
    columns:
      - name: user_id
      - name: product_id
      - name: account_id
```

So, in the example above, the fields in the sidebar for "My Table" would appear in the order:

- user_id
- product_id
- account_id

Instead of being listed alphabetically.

Here are some other things worth mentioning about the `order_fields_by` parameter:

- By default, `order_fields_by` is set to `label`, which means that your fields will appear in the table listed alphabetically.
- Since metrics can be declared in multiple places within your .yml (as a dbt metric, in the model `meta` tag, under a dimension's `meta`), we force the following order on metrics if you set `order_fields_by` to `index`:

  - dbt metrics appear first
  - then, metrics defined in the model's `meta`
  - then, metrics defined in the dimensions' `meta`
- Group labels inherit the index of the first dimension that use them.
