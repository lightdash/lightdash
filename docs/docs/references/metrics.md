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

## Metric Categories
Each metric type falls into one of these categories. The metric categories tell you whether the metric type is an aggregation and what type of fields the metric can reference:

### Aggregate metrics:
Aggregate metric types perform (surprise, surprise) aggregations. Sums and averages are examples of aggregate metrics: they are measurements summarizing a collection of data points.

Aggregate metrics can *only* reference dimensions, not other metrics.

### Non-aggregate metrics:
Non-aggregate metrics are metric types that, you guessed it, do *not* perform aggregations.

Numbers and booleans are examples of non-aggregate metrics. These metric types perform a calculation on a single data point, so they can only reference aggregate metrics. They *cannot* reference dimensions.

## Metric types:

|       Type                        | Category  | Description                                                 |
|:---------------------------------:| --------- | ----------------------------------------------------------- |
| [average](#average)               | Aggregate | Generates an average (mean) of values within a column       |
| [boolean](#boolean)               | Non-aggregate | For fields that will show if something is true or false |
| [count](#count)                   | Aggregate | Counts the total number of values in the dimension          |
| [count_distinct](#count_distinct) | Aggregate | Counts the total unique number of values in the dimension   |
| [date](#date)                     | Non-aggregate | For measures that contain dates                         |
| [max](#max)                       | Aggregate | Generates the maximum value within a column                 |
| [min](#min)                       | Aggregate | Generates the minimum value within a column                 |
| [number](#number)                 | Non-aggregate | For measures that contain numbers                       |
| [string](#string)                 | Non-aggregate | For measures that contain letters or special characters |
| [sum](#sum)                       | Aggregate | Generates a sum of values within a column                   |


### average
Takes the average (mean) of the values in the given field. Like SQL's `AVG` function.

The `average` metric can be used on any numeric dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a numeric table column.

For example, this creates a metric `avg_price` by taking the average of the `item_price` dimension:

```
columns:
  - name: item_price
    meta:
      metrics:
        avg_price:
          type: average
```

### boolean
Tells you whether something is True or False.

The `boolean` metric can be used on any valid SQL expression that gives you a `TRUE` or `FALSE` value. It can only be used on aggregations, which means either aggregate metrics *or* [custom SQL that references other metrics](#using-custom-sql-in-non-aggregate-metrics). You cannot build a `boolean` metric by referencing other unaggregated dimensions from your model.

`boolean` metrics don't do any aggregations; they just reference other aggregations.

For example, the `avg_price` metric below is an average of all of the `item_price` values in our product table. A second metric called `is_avg_price_above_20` is a `boolean` type metric. The `is_avg_price_above_20` metric has a custom SQL expression that tells us whether the `avg_price` value is greater than 20.

```
columns:
  - name: item_price
    meta:
      metrics:
        avg_price:
          type: average
        is_avg_price_above_20:
          type: boolean
          sql: "IF(${avg_price} > 20, TRUE, FALSE)"
```

### count
Does a table count, like SQL’s `COUNT` function.

The `count` metric can be used on any dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a set of values.

For example, this creates a metric `number_of_users` by counting the number of `user_id` values in the table:

```
columns:
  - name: user_id
    meta:
      metrics:
        number_of_users:
          type: count
```

### count_distinct
Counts the number of distinct values in a given field. It's like SQL’s `COUNT DISTINCT` function.

The `count_distinct` metric can be used on any dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a set of values.

For example, this creates a metric `number_of_unique_users` by counting the number of unique `user_id` values in the table:

```
columns:
  - name: user_id
    meta:
      metrics:
        number_of_unique_users:
          type: count_distinct
```

### date
Gives you a date value from an expression.

The `date` metric can be used on any valid SQL expression that gives you a date value. It can only be used on aggregations, which means either aggregate metrics *or* [custom SQL that references other metrics](#using-custom-sql-in-non-aggregate-metrics). You cannot build a `date` metric by referencing other unaggregated dimensions from your model.

To be honest, `date` metrics are pretty rarely used because most SQL aggregate functions don't return dates. The only common use of this metric is if you use a `MIN` or `MAX` on a date dimension.

```
columns:
  - name: date_updated
    meta:
      metrics:
        most_recent_date_updated:
          type: date
          sql: "MAX(${date_updated})"
```

### max
Max gives you the largest value in a given field. It's like SQL’s `MAX` function.

The `max` metric can be used on any dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a set of values.

For example, this creates a metric `max_delivery_cost` by looking at the `delivery_cost` dimension and taking the largest value it finds:

```
columns:
  - name: delivery_cost
    meta:
      metrics:
        max_delivery_cost:
          type: max
```

### min
Min gives you the smallest value in a given field. It's like SQL’s `MIN` function.

The `min` metric can be used on any dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a set of values.

For example, this creates a metric `min_delivery_cost` by looking at the `delivery_cost` dimension and taking the smallest value it finds:

```
columns:
  - name: delivery_cost
    meta:
      metrics:
        min_delivery_cost:
          type: min
```

### number
Used with numbers or integers. A `number` metric doesn't perform any aggregation but can be used to perform simple transformations on other metrics.

The `number` metric can be used on any valid SQL expression that gives you a numeric or integer value. It can only be used on aggregations, which means either aggregate metrics *or* [custom SQL that references other metrics](#using-custom-sql-in-non-aggregate-metrics). You cannot build a `number` metric by referencing other unaggregated dimensions from your model.

For example, this creates a metric called `total_gross_profit_margin_percentage` based on the `total_sale_price` and `total_gross_profit_margin` aggregate metrics:

```
columns:
  - name: sale_price
    meta:
      metrics:
        total_sale_price:
          type: sum
  - name: gross_profit_margin
    meta:
      metrics:
        total_gross_profit_margin:
          type: sum
        total_gross_profit_margin_percentage:
          type: number
          sql: "(${total_gross_profit_margin}/ NULLIF(${total_sale_price},0))"
```

The example above also uses the NULLIF() SQL function to avoid division-by-zero errors.

### sum
Adds up the values in a given field. Like SQL’s `SUM` function.

The `sum` metric can be used on any numeric dimension or, [for custom SQL](#using-custom-SQL-in-aggregate-metrics), any valid SQL expression that gives a numeric table column.

For example, this creates a metric `total_revenue` by adding up the values in the `revenue` dimension:

```
columns:
  - name: revenue
    meta:
      metrics:
        total_revenue:
          type: sum
```

### string
Used with fields that include letters or special characters.

The `string` metric can be used on any valid SQL expression that gives you a string value. It can only be used on aggregations, which means either aggregate metrics *or* [custom SQL that references other metrics](#using-custom-sql-in-non-aggregate-metrics). You cannot build a `string` metric by referencing other unaggregated dimensions from your model.


`string` metrics are rarely used because most SQL aggregate functions don't return strings. One common exception is MySQL’s `GROUP_CONCAT` function.

For example, this creates a metric `product_name_group` by combining the unique values of a dimension called `product_name`:

```
columns:
  - name: product_name
    meta:
      metrics:
        product_name_group:
          type: string
          sql: "GROUP_CONCAT(${product_name})"
```

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
  is_num_unique_users_above_100:
    type: boolean
    sql: "IF(${num_unique_users} > 100, TRUE, FALSE)"
  percentage_user_growth_daily:
    type: number
    sql: "(${num_unique_users} - ${growth_model.num_unique_users_lag_1d}) / NULLIF(${growth_model.num_unique_users_lag_1d}, 0)"
```
