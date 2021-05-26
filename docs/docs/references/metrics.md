---
sidebar_position: 4
---

# Metrics

Metrics are quantitative measurements. You can think of them as "actions" that you take on dimensions. For example, num unique user ids is a metric that counts the unique number user_id values.

---

## Adding metrics to your project

To add a metric to lightdash, you define it in your dbt project under the dimension name you're applying the measurement on.

```version: 2

models:
  - name: my_model
    columns:
      - name: user_id # dimension name of your metric
        meta:
          measures:
            num_unique_user_ids: # name of your metric
              type: count_distinct # metric type
            num_user_ids:
              type: count
```

## Metric types:

|       Type      | Description                                               |
|:---------------:| --------------------------------------------------------- |
| average         | Generates an average (mean) of values within a column     |
| count           | Counts the total number of values in the dimension        |
| count_distinct  | Counts the total unique number of values in the dimension |
| max             | Generates the maximum value within a column               |
| min             | Generates the minimum value within a column               |
| sum             | Generates a sum of values within a column                 |

## Adding your own metric descriptions

We add default descriptions to all of the metrics you include in your model. But, you can override these using the description parameter when you define your metric.

```
measures:
  num_user_ids:
    type: count
    description: "Total number of user IDs. NOTE: this is NOT counting unique user IDs"
```

## Using custom SQL in metrics

You can include custom SQL in your metric definition to build more advanced metrics using the sql parameter.
Inside the sql parameter, you can reference any other dimension from the given model and any joined models. You **can’t reference other metrics.**

You can reference dimensions from the same model like this: `sql: "${dimension_in_this_model}"`
Or from joined models like this: `sql: "${other_model.dimension_in_other_model}"`

```
measures:
  num_unique_7d_web_active_user_ids:
    type: count_distinct # metric type
    sql: "IF(${is_7d_web_active}, ${user_id}, NULL)"
  num_unique_paid_user_ids:
    type: count_distinct
    sql: "IF(${subscriptions.is_active}, ${user_id}, NULL)"
```
