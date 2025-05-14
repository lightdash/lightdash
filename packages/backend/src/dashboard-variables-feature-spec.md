# Dashboard variables

Variables are new fields on explores, separate to metrics, dimensions, and filters.

Variables can be used in any of the sql fields in an explore (commonly the dimension.sql or metric.sql fields).

An example would be:

```
# dbt yaml

models:
  - name: my_model
    meta:
      variables:
        - name: my_variable
          type: "string"
          default: "my_default_value"
      dimensions:
        dimension_one:
          sql: "${ TABLE }.column_name == ${ my_variable } " 
```

A default value is useful so that the variable is always defined. Then we can incrementally add support for more variables.

Variables will be set the same as filters.