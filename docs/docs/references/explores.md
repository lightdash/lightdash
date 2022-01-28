---
sidebar_position: 2
---

# Explores

An explore is a table that you can run queries against in your Lightdash project.

Explores are built from dbt models (either one, or many joined together).

---

## Adding Explores to your project

Explores come from dbt models that have been defined in your dbt project's schema.yml files.

If your dbt model has been defined in a .yml file, it will appear in Lightdash as an Explore.


For example, if we had this in our schema.yml files in dbt, we'd see an Explore called `users` in Lightdash.

```
version: 2

models:
  - name: users
```

## Explore configuration

You can customize your Explores in your dbt model's YAML file. Here's an example of the properties used in defining an Explore:

```
version: 2

models:
  - name: my_explore
    meta:
      label: "My Custom Explore Name"
      joins:
        - join: my_other_explore
          sql_on: ${my_explore.column_a} = ${my_other_explore.column_a}
```

Here are all of the properties you can customize:

| Property                                            | Value                 | Note                                                                                  |
| --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| label                                               | string                | Custom label. This is what you'll see in Lightdash instead of the Explore name.        |
| [joins](joins.md)       | string                |  Join logic to join other data models to the Explore. [Read more about joins in here.](joins.md)|


### If you've added a new dbt model to your project, you need to do `dbt run` + `dbt refresh`
before it before it will appear in Lightdash. Lightdash gets information about your data models from dbt.
But it gets information about the data **_generated_** by those data models from your data warehouse.

This means that if you add a new dbt model to your project or update a model so that you're making changes
to the table it generates, then you need to do two things before your changes will appear in Lightdash:
1. **Materialize the new table/changes to the table (using `dbt run`).**   
You basically want the data in your data warehouse to be the new
table you're expecting. So you need to do `dbt run` to update the table from the data model you just changed.  

2. **Click `dbt refresh` in Lightdash.**   
This will re-sync your dbt project in Lightdash so that any changes you made
to your dbt models is shown in Lightdash (e.g. adding a new table).
