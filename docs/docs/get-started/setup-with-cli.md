---
sidebar_position: 2
sidebar_label: Setup with cli
---

# Setup Lightdash with your existing dbt project

In this tutorial, you'll setup Lightdash and connect it to your existing dbt project. You should already be familiar
with dbt. At the end of the tutorial you'll be able to use the Lightdash UI to start exploring your dbt project and
run queries.

**Prerequisites**
* You need an existing [dbt](https://www.getdbt.com/) project. The project should be compatible with dbt version `0.20.0` or higher.

## 1. Clone the Lightdash repository

Clone the Lightdash code to your local machine. This will create a new directory called `./lightdash` (the Lightdash directory).

```bash
# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash
cd lightdash
# A new directory called "lightdash" should appear
```

## 2. Install & Launch Lightdash

```bash
./install.sh 
# follow cli instructions
```


### With local dbt project

If you're using a local dbt project, during the cli, select the option **with local dbt**.
Also, during the project creation, keep the **Project directory** value as "/usr/app/dbt"

## Next steps

Start adding dimensions, metrics, and joins to your dbt tables:

* [How to create dimensions](../guides/how-to-create-dimensions.md)
* [How to create metrics](../guides/how-to-create-metrics.md)
* [How to join tables](../guides/how-to-join-tables.md)

Learn how to start exploring data with Lightdash:
* Run a query
* Create a chart
* Export query results
