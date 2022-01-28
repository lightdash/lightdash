---
sidebar_position: 6
---

# Syncing your dbt changes (refresh dbt)

You can easily make changes in dbt and see them updated in your Lightdash project.

---

Each time you launch Lightdash, it automatically syncs to the most up-to-date version of your dbt project.

After you've launched Lightdash, if you make changes in your YAML file, you can sync and see these changes by clicking the `refresh` button in the web app.

![screenshot-refresh-dbt](assets/screenshot-refresh-dbt.png)

## If you've made any changes to the underlying data, you need to run dbt

If you've made any changes to the underlying data (for example,  adding a new column in your `model.sql` file or changing the SQL logic of an existing dimension),  then you need to run: `dbt run -m yourmodel` before you click `refresh` in Lightdash.
