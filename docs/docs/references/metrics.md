---
sidebar_position: 4
---

# Metrics reference sheet

A metric is a value that describes or summarizes features from a collection of data points.
For example, `Num unique user ids` is a metric. It describes the unique number of `user_id`s in a collection of `user_id` data points.

In Lightdash, metrics are used to summarize dimensions or, sometimes, other metrics.

---

## Adding metrics to your project

There are two ways to add metrics to your project in Lightdash:

1. (**Suggested**) [Using the `meta` tag](#using-the-meta-tag)
2. [Using dbt's `metrics` tag](#using-dbts-metrics-tag) (this is still an Alpha feature)

### 1. Using the `meta` tag (Suggested)

To add a metric to Lightdash using the `meta` tag, you define it in your dbt project under the dimension name you're trying to describe/summarize.

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

Once you've got the hang of what these metrics look like, read more about the [metric types you can use below.](#metric-types)

### 2. Using dbt's `metrics` tag

You can also add some metric to Lightdash using dbt's `metrics` tag in your model's `.yml` file. Here's a tutorial explaining how to do it:

[![demo create dbt metrics](./assets/loom-adding-dbt-metrics.png)](https://www.loom.com/share/811d8f71a3864a74a4849bdb164e7a4b)

So, metrics defined using dbt's `metrics` tag look something like this:

```yaml
# schema.yml
version: 2
metrics:
  - name: customer_count
    label: DBT METRIC!
    model: ref('customers')
    description: "A NEW DBT METRIC nuuuuuts"
    type: count_distinct
    sql: customer_id # must be a simple column name that you want to apply this metric to
    meta:
      hidden: false
```

:::info

Using the `metrics` tag has a couple of limitations (a.k.a. "features" 😉) in Lightdash we think are worth pointing out. Read more about them below.

:::

- **The `sql` field must be a simple column name.**

  It should be the column name that you want to apply your metric to (e.g. `customer_id` for the metric `total_customers`). Itcannot be anything more than a column name.

  The reason for this limitation is that dbt assumes metrics are only from a single table. In Lightdash, metrics can be queried from many tables.

- **Metrics automatically get all dimensions on the model**

  The dbt metrics spec asks the user to specify explicit columns on the model that apply to that metric. So for a `customer_count` metric, a user might request that only 3 columns apply as valid dimensions for that metric. We ignore this because in the Lightdash UI a model simply shows all metrics and dimensions of that model.

- **Metrics under the `meta:` tag on specific models take precedent over project metrics under the `metrics:` tag**

  For example, if we have two metrics for `customer_count`: one using the dbt `metrics` tag and the other using the `meta` tag,

  ``` yaml
  metrics:
    - name: customer_count
      type: count_distinct
      sql: customer_id
      model: customers
  ```

  ```yaml
  models:
    - name: customers
      columns:
        - name: customer_id
          meta:
          metrics:
            customer_count:
              type: count
  ```

  The second metric has the same name `customer_count` on the same model `customers` but the first uses type: count_distinct and the second uses type: count. Because the second metric is defined on the column `meta:` tag, it'll take priority over the first.

- The `type` must be [one of the Lightdash types](#metric-types).

- `timestamp`, `time_grains`, and `dimensions` are all ignored because metrics get all dimensions of the model.
- `label` is ignored - but should be implemented soon!
- `filters` are not supported - again this should be implemented soon for all metrics!

## Metric Categories

Each metric type falls into one of these categories. The metric categories tell you whether the metric type is an aggregation and what type of fields the metric can reference:

### Aggregate metrics

Aggregate metric types perform (surprise, surprise) aggregations. Sums and averages are examples of aggregate metrics: they are measurements summarizing a collection of data points.

Aggregate metrics can *only* reference dimensions, not other metrics.

### Non-aggregate metrics

Non-aggregate metrics are metric types that, you guessed it, do *not* perform aggregations.

Numbers and booleans are examples of non-aggregate metrics. These metric types perform a calculation on a single data point, so they can only reference aggregate metrics. They *cannot* reference dimensions.

## Metric configuration

You can customize your metrics in your dbt model's YAML file. Here's an example of the properties used in defining a metric:

```yaml
version: 2

models:
  - name: my_model
    columns:
      - name: revenue
        description: "Total estimated revenue in GBP based on forecasting done by the finance team."
        meta:
          metrics:
            total_revenue:
              label: 'Total revenue GBP'
              type: SUM
              description: "Total revenue in GBP"
              sql: "IF(${revenue} IS NULL, 10, ${revenue})"
              hidden: false
              round: 0
              format: 'gbp'
```

Here are all of the properties you can customize:

| Property                                            | Required | Value              | Description                                                                                                                                                   |
|-----------------------------------------------------| -------- |--------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| label                                               | No       | string             | Custom label. This is what you'll see in Lightdash instead of the metric name.                                                                                |
| [type](#metric-types)                               | Yes      | metric type        | Metrics must be one of the supported types.                                                                                                                   |
| [description](#adding-your-own-metric-descriptions) | No       | string             | Description of the metric that appears in Lightdash. A default description is created by Lightdash if this isn't included                                     |
| [sql](#using-custom-sql-in-aggregate-metrics)       | No       | string             | Custom SQL used to define the metric.                                                                                                                         |
| hidden                                              | No       | boolean            | If set to `true`, the metric is hidden from Lightdash. By default, this is set to `false` if you don't include this property.                                 |
| round                                               | No       | number             | Rounds a number to a specified number of digits                                                                                                               |
| format                                              | No       | string             | This option will format the output value on the result table and CSV export. Currently supports one of the following: `['km', 'mi', 'usd', 'gbp', 'percent']` |
| groupLabel                                          | No       | string             | If you set this property, the dimension will be grouped in the sidebar with other dimensions with the same group label.                                       |

## Metric types

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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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

```yaml
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
