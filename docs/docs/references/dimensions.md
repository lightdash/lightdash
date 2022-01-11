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
      - name: registered_user_email
        description: 'Email address of a registered user."
        meta:
          dimension:
            label: 'email' # this is the label you'll see in Lightdash
            description: 'My custom description'
            sql: "IF(${registered_user_email} = 'katie@lightdash.com', NULL, ${registered_user_email})"
```

All the properties you can customize:

| Property        | Value                 | Note                                                                                  |
| --------------- | --------------------- | ------------------------------------------------------------------------------------- |
| label           | string                | Custom label. This is what you'll see in Lightdash instead of the dimension name.     |
| type            | Dimension type        | The dimension type is automatically pulled from your table schemas in Lightdash but you can override the type using this property. |
| description     | string                | Description of the dimension in Lightdash. You can use this to override the description you have for the dimension in dbt. |
| sql             | string                | Custom SQL applied to the column used to define the dimension.                        |
| time_intervals  | `'default'` or `OFF` or string[] | `'default'` will be converted into `['DAY', 'WEEK', 'MONTH', 'YEAR']` for dates and `['RAW', 'DAY', 'WEEK', 'MONTH', 'YEAR']` for timestamps, as will not setting anything; if you want no time intervals set `'OFF'` |


## Dimension types

Dimension types are automatically pulled from your tables schemas in Lightdash. We currently support these dimension types:

| Dimension Types |
| --------------- |
| string          |
| number          |
| timestamp       |
| date            |
| boolean         |

## Time intervals
Lightdash automatically adds intervals for dimensions that are timestamps or dates, so you don't have to!

For example, here we have the timestamp dimension `created` defined in our dbt project:
```
      - name: created
        description: 'Timestamp when the user was created.'
```

Lightdash breaks this out into the default intervals automatically. So, this is how `created` appears in our Lightdash project:

![screenshot-default-intervals](assets/screenshot-default-intervals.png)

### By default, the time intervals we use are:
**Date**: ['DAY', 'WEEK', 'MONTH', 'YEAR']
**Timestamp**: ['RAW', 'DAY', 'WEEK', 'MONTH', 'YEAR']

### To change the time intervals used for a dimension, specify your custom intervals using `time_intervals`
If you want to change the time intervals shown for a dimension, you can specify the custom time intervals you'd like you include using the `time_intervals` property for a dimension. You can use any values supported by your warehouse.

In this example, I've only included the day, month, and quarter time intervals for the `created` dimension in Lightdash.

```
      - name: created
        description: 'Timestamp when the user was created.'
        meta:
          dimension:
            time_intervals: ['DAY', 'MONTH', 'QUARTER']
```

![screenshot-custom-intervals](assets/screenshot-custom-intervals.png)

### To turn off time intervals for a dimension, set `time_intervals: OFF`
If you want to turn off time intervals for a dimension, you can simply set the `time_intervals` property to `OFF`.

In this example, `created` would now appear as a single, timestamp dimension without a drop-down list of time intervals in Lightdash:

```
      - name: created
        description: 'Timestamp when the user was created.'
        meta:
          dimension:
            time_intervals: OFF
```

![screenshot-intervals-off](assets/screenshot-intervals-off.png)
