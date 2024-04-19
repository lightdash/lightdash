# Transformers overview

This directory contains classes that are used to transform the data between each layer of the application.

At the moment there are 3 types of transformers:

-   **Results**: Transforms data related the query and results
-   **Viz configuration**: Validates, manages and transforms the viz configuration
-   **Viz library**: Transforms the viz configuration into a viz library specific configuration

The viz configuration and viz library transformers instances should **ONLY** be created via their factory.

## Usage

To render a visualisation, you need to chain all the transformers together. Here is an example of how to do it:

```typescript
const results = {}; // this would be the data from the backend after running a query (explore/sql runner/semanticlayer)

// Create a results transformer
const resultsTransformer = new ExplorerResultsTransformer({ data: results });

const barVizConfig = {}; // example of a bar chart viz config
// Create a Viz config transformer
const vizConfigTransformer =
    VizConfigTransformerFactory.createVizConfigTransformer({
        vizConfig: barVizConfig,
        resultsTransformer,
    });

// Create a Viz lib transformer
const vizLib = VizLibTransformerFactory.createVizLibTransformer({
    vizConfigTransformer,
});

// Get the data & configuration for the viz library
vizLib.getConfig();
```
