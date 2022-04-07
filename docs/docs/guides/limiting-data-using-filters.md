# Limit the data in your query using Filters

Filters appear at the top of an explore and allow users to change the data being pulled into the explore. For example, if I built a chart showing the revenue over time, but I wanted it to only have the revenue I made in France, I could add a filter for `country is equal to France`.

## Adding filters in the Explore view

There are a couple of ways that you can add filters in the Explore view. 

### Adding a filter from within the `Filters` tab

In the Explores view, you can add filters from within the `Filters` tab. Just click to open the toggle, then click `add filter`.

![adding filters from toggle](./assets/adding-filters-from-toggle-1.png)

Select the field you would like to filter from the drop-down list, then select the filtering options.

### Adding a filter from the sidebar

It's easy to add filters directly from the list of fields in the sidebar. Just click on the `options` for a field, then click `add filter`. 

![add-filter-sidebar](assets/add-filter-sidebar.png)

### Adding a filter from the results table

Once you have some results in your results table, you can add filters by right-clicking on the value you want to filter by.

![add-filter-results-table](assets/add-filter-results-table.png)

## If you want to filter on multiple fields, just click `+ Add filter`

![add-filter](assets/add-filter.png)

:::info
These multiple filters are joined together using AND, so, the example above would give us compiled SQL that looks like:
```
WHERE (
  (users.days_since_activated) > 5
  AND (users.days_since_activated)...
```

## If you want to include multiple values in your filter, just hit `enter` between each value entry in your list

![screenshot-multiple-values-filter](assets/screenshot-multiple-values-filter.png)

The listed values are separated by an OR statement in the compiled SQL. E.g. the above would give us:
```
WHERE (
  (users.days_since_activated) > 5
   AND (users.days_since_activated) IN (1,2,3)
)
```

## To learn about the types of filters we have available, check out the filters reference doc. 

Check out our [filters reference doc here](docs.lightdash.com/references/filters) to see a list of all available filters and their uses. 