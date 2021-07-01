---
sidebar_position: 4
---

# Metrics

Metrics are quantitative measurements. You can think of them as "actions" that you take on dimensions. For example, num unique user ids is a metric that counts the unique number user_id values.

---

## Adding metrics to your project

To add a metric to Lightdash, you define it in your dbt project under the dimension name you're applying the measurement on.

```version: 2

models:
  - name: my_model
    columns:
      - name: user_id # dimension name of your metric
        meta:
          metrics:
            num_unique_user_ids: # name of your metric
              type: count_distinct # metric type
            num_user_ids:
              type: count
```

## Metric types:

|       Type      | Category  | Description                                                 |
|:---------------:| --------- | ----------------------------------------------------------- |
| average         | Aggregate | Generates an average (mean) of values within a column       |
| count           | Aggregate | Counts the total number of values in the dimension          |
| count_distinct  | Aggregate | Counts the total unique number of values in the dimension   |
| max             | Aggregate | Generates the maximum value within a column                 |
| min             | Aggregate | Generates the minimum value within a column                 |
| sum             | Aggregate | Generates a sum of values within a column                   |
| string          | Non-aggregate | For measures that contain letters or special characters |
| number          | Non-aggregate | For measures that contain numbers                       |
| date            | Non-aggregate | For measures that contain dates                         |
| boolean         | Non-aggregate | For fields that will show if something is true or false |

## Adding your own metric descriptions

We add default descriptions to all of the metrics you include in your model. But, you can override these using the description parameter when you define your metric.

```
metrics:
  num_user_ids:
    type: count
    description: "Total number of user IDs. NOTE: this is NOT counting unique user IDs"
```

## Using custom SQL in aggregate metrics

You can include custom SQL in your metric definition to build more advanced metrics using the sql parameter.
Inside the sql parameter, you can reference any other dimension from the given model and any joined models. You **can’t reference other metrics.**

You can reference dimensions from the same model like this: `sql: "${dimension_in_this_model}"`
Or from joined models like this: `sql: "${other_model.dimension_in_other_model}"`

```
metrics:
  num_unique_7d_web_active_user_ids:
    type: count_distinct # metric type
    sql: "IF(${is_7d_web_active}, ${user_id}, NULL)"
  num_unique_paid_user_ids:
    type: count_distinct
    sql: "IF(${subscriptions.is_active}, ${user_id}, NULL)"
```

## Using custom SQL in non-aggregate metrics

In non-aggregate metrics, you can reference any other metric from the given model and any joined models. You **can’t reference other dimensions.**

You can reference metrics from the same model like this: `sql: "${metric_in_this_model}"`
Or from joined models like this: `sql: "${other_model.metric_in_other_model}"`

```
metrics:
  num_unique_users:
      type: count_distinct
  num_unique_7d_web_active_users:
    type: count_distinct
    sql: "IF(${is_7d_web_active}, ${user_id}, NULL)"
  num_unique_non_7d_web_active_users:
    type: sum
    sql: "${num_unique_users} - ${num_unique_7d_web_active_users}" # both are metrics coming from the base model
```
