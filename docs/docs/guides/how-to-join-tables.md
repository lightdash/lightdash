---
sidebar_position: 3
---

# How to join tables

Learn how to add joins to your YAML files to connect different models to each other.

## Declare joins in dbt model properties

Joins let you to connect different models to each other so that you can explore more than one model at the same time in Lightdash and see how different parts of your data relate to each other.

You add joins to your YAML files under the `meta` tag at the model level:

```yaml
version: 2

models:
  - name: users
    meta:
      joins:
        - join: segment_web_sessions
          sql_on: ${segment_web_sessions.user_id} = ${users.user_id}

    columns:
```

Once you've added a join, you can refresh Lightdash to see your changes in action. The dimensions and metrics of the joined model are included in the list on the left, right below the original model:

![screenshot-joined-tables](assets/screenshot-joined-tables.png)

## Next steps

- Read more about customising joins in the [joins reference](../references/joins.mdx)
