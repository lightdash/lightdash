# Catalog Model

## `CatalogModel` Overview

The `CatalogModel` powers the Lightdash Spotlight feature (a.k.a. Metrics Explorer, a.k.a. Data Catalog). It’s built on top of the cached_explores table, which stores the full structure of a project’s explores parsed from dbt + Lightdash YAML files.

Its core responsibilities include:

-   **Indexing:** The `indexCatalog` method transforms structured `Explore` objects (originating from YAML files) from a project into a flattened, searchable format. It processes tables, dimensions, and metrics, storing them as individual items in the `catalog_search` table. This process also handles the association of metadata like YAML-defined tags, user-defined tags, and chart usage statistics.
-   **Searching:** The `search` method provides a powerful and flexible interface for querying the catalog. It supports a wide range of filtering criteria, including full-text search, pagination, sorting, and filtering based on user attributes, table configurations, and various tagging systems. All filtering is executed directly within the database (using Knex.js) to ensure high performance.
-   **Metadata Management:** Beyond indexing and searching, the model manages other catalog-related entities, such as UI-applied tags, metric dependency trees (`Metric Trees`), and chart usage metrics.

## The `search` Method

The `search` method is the main entry point for querying the data catalog. It is designed to handle complex filtering scenarios by combining multiple parameters into a single, efficient database query.

### Filtering with `yamlTags`

The `yamlTags` parameter provides a mechanism to filter catalog items based on tags defined in the project's dbt YAML files. This is primarily used to control exposure for AI features.

The parameter accepts an array of strings (`string[] | null`):

-   If `yamlTags` is `null`, no tag-based filtering is applied. This corresponds to the "No tags configured in settings UI" scenario where everything is visible by default.
-   If `yamlTags` is an empty array (`[]`), the query will correctly return no results, as no item can match a tag from an empty set.

#### Filtering Logic and Visibility Rules

The filtering logic follows a specific set of rules to determine which catalog items (explores, tables, and fields) are visible.

**No tags are configured in settings UI:**

| Tagging Scenario                  | AI Visibility                    |
| --------------------------------- | -------------------------------- |
| No tags configured in settings UI | Everything is visible by default |

**Tags are configured in settings UI:**

| Tagging Scenario                     | AI Visibility             |
| ------------------------------------ | ------------------------- |
| Explore only (with matching tag)     | All fields in the Explore |
| Some fields only (with matching tag) | Only those tagged fields  |
| Explore + some fields (with match)   | Only those tagged fields  |
| No matching tags                     | Nothing is visible        |
