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
```

When you open Lightdash, your joined models' dimensions and metrics will appear below the ones in your selected model.

![screenshot-joined-table](assets/screenshot-joined-table.png)

## Rename a joined model

When joining a model B onto a model A, you may want to rename the model for readability. This can be done with the 
`label` tag, for example on this `messages` model it's more suitable for our business to call the joined user a 
"sender":

```yaml
models:
  - name: messages
    meta:
      joins:
        - join: users
          label: Sender
          sql_on: ${messages.sent_by} = ${users.user_id}
```

## Join the same table multiple times with an `alias`

If you need to join a table multiple times, you can use an `alias` to distinguish between the different tables. A 
common use case is joining a user table multiple times to another table depending on the type of user. For example 
this `messages` model has bother a sender and a recipient:

```yaml
models:
  - name: messages
    meta:
      joins:
        - join: users
          alias: sender
          sql_on: ${messages.sent_by} = ${sender.user_id}
        - join: users
          alias: recipient
          sql_on: ${messages.sent_to} = ${recipient.user_id}
```

Note the following important differences when aliasing models in joins:
1. You must reference the fields in the model using the new alias. Notice that the joins above use `${sender.user_id}
   ` rather than `${users.user_id}`.
2. Because of the above, any fields in the base model or joined model that reference any field `${users.*}` will 
   fail to compile. Be careful of aliasing tables that are used in the base model.
3. Joined models are automatically relabelled with the alias but you may also customise this using the `label:` 
   field as above.

## Only select a subset of fields from a join

Use the `fields` tag to select a subset of fields from a join. This is useful if you want to join a model but only a 
few of its fields are useful in the joined context. For example this `messages` model only needs the `name` and 
`email` fields from the `users` model. Note we must also include the `user_id` field since it's needed for the join.

```yaml
models:
  - name: messages
    meta:
      joins:
        - join: users
          sql_on: ${messages.sent_by} = ${users.user_id}
          fields: [user_id, email, name]
```

## Using joined dimensions or metrics in your .yml

Once you've joined a model, you can reference the metrics and dimensions from your joined model in your configurations. 

For example, I can filter one of my metrics using a dimension from my joined model, like this:

```yaml
version: 2

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
            num_unique_premium_user_ids:
              type: count_distinct
              filters:
                - subscriptions.plan: premium
```

You can also reference these joined metrics and dimensions in custom sql, like this:

```yaml
version: 2

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
          dimension:
            sql: IF(${subscriptions.plan} IS NULL, NULL, ${user_id})
          metrics:
            num_unique_premium_user_ids:
              type: count_distinct
              sql: IF(${subscriptions.plan} = 'premium', ${user_id}, NULL)
```

Check out our [dimensions](/references/dimensions) and [metrics](/references/metrics) reference docs to see all of the other configurations you can use with your joined fields.
