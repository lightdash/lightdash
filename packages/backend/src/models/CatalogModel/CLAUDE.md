# Catalog Model

## `CatalogModel` Overview

The `CatalogModel` powers the Lightdash Spotlight feature (a.k.a. Metrics Explorer, a.k.a. Data Catalog). It’s built on top of the cached_explores table, which stores the full structure of a project’s explores parsed from dbt + Lightdash YAML files.

Its core responsibilities include:

-   **Indexing:** The `indexCatalog` method transforms structured `Explore` objects (originating from YAML files) from a project into a flattened, searchable format. It processes tables, dimensions, and metrics, storing them as individual items in the `catalog_search` table. This process also handles the association of metadata like YAML-defined tags, user-defined tags, and chart usage statistics.
-   **Searching:** The `search` method provides a powerful and flexible interface for querying the catalog. It supports a wide range of filtering criteria, including full-text search, pagination, sorting, and filtering based on user attributes, table configurations, and various tagging systems. All filtering is executed directly within the database (using Knex.js) to ensure high performance.
-   **Metadata Management:** Beyond indexing and searching, the model manages other catalog-related entities, such as UI-applied tags, metric dependency trees (`Metric Trees`), and chart usage metrics.

## The `search` Method

The `search` method is the main entry point for querying the data catalog. It is designed to handle complex filtering scenarios by combining multiple parameters into a single, efficient database query.
