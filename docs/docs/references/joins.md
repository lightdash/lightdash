---
sidebar_position: 3
---

# Joins reference sheet

Joins let you connect different models to each other so that you can explore more than one model at the same time in Lightdash and see how different parts of your data relate to each other.

---

## Adding joins in your models

Joins are defined at the same level as your model parameters in your YAML file.

:::info

All joins are defined as `LEFT OUTER` joins.

:::

```version: 2

models:
  - name: users
    meta:
      joins:
        - join: web_sessions
          sql_on: ${web_sessions.user_id} = ${users.user_id}
        - join: subscriptions
          sql_on: ${subscriptions.user_id} = ${users.user_id} AND ${subscriptions.is_active}

    columns:
      - name: user_id
        meta:
          metrics:
            num_unique_user_ids:
              type: count_distinct
```

When you open Lightdash, your joined models' dimensions and metrics will appear below the ones in your selected model.

![screenshot-joined-table](assets/screenshot-joined-table.png)
