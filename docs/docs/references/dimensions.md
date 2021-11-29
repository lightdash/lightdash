---
sidebar_position: 1
---

# Dimensions

Dimensions are the columns in your table. They are the "attributes" of your data. For example, user_id in your users table is a dimension.

---

## Adding dimensions to your project

For a dimension to appear in Lightdash, you just need to declare it in your dbt model's YAML file.

```
version: 2

models:
  - name: my_model
    columns:
      - name: user_id # will be "User id" in LightDash
        description: 'Unique identifier for a user."
```

Column descriptions in your YAML file are automatically pulled into Lightdash and you can spot them if you hover over the dimension name 👀

![screenshot-column-descriptions](assets/screenshot-column-descriptions.png)

## Dimension configuration

To customize the dimension, you can do it in your dbt model's YAML file.

```
version: 2

models:
  - name: my_model
    columns:
      - name: user_id # will be "User id" in LightDash
        description: 'Unique identifier for a user."
        meta: 
          dimension:
            name: 'ID'
            description: 'My custom description'
```

All the properties you can customize:

| Property        | Value                 | Note |
| --------------- | --------------------- | ---- |
| name            | string                | |
| type            | Dimension type        | |
| description     | string                | |
| sql             | string                | |
| time_intervals  | `'default'` or string[] | `'default'` will be converted into `['DAY', 'WEEK', 'MONTH', 'YEAR']` for dates and `['MILLISECOND', 'DAY', 'WEEK', 'MONTH', 'YEAR']` for timestamps |


## Dimension types

Dimension types are automatically pulled from your tables schemas in Lightdash. We currently support these dimension types:

| Dimension Types |
| --------------- |
| String          |
| Number          |
| Timestamp       |
| Date            |
| Boolean         |

## Time intervals

The most common intervals are `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month` and `year` but you can
set any value supported by your warehouse.
