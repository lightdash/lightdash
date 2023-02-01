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

```
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

Notes on the order logic:
- Fields order defaults to "label"
- Since metrics can be declared in multiple places we forced the following order: **dbt metrics** > **metrics in model
metadata** > **metrics in dimension metadata**
- Group labels inherit the index of the first dimension that uses it

