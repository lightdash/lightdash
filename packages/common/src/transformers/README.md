# Transformers overview

This directory contains classes that are used to transform the data between each layer of the application.

At the moment there are 3 types of transformers:

-   **Results**: Transforms data related the query and results
-   **Viz configuration**: Validates, manages and transforms the viz configuration
-   **Viz library**: Transforms the viz configuration into a viz library specific configuration

The viz configuration and viz library transformers instances should **ONLY** be created via their factory.
