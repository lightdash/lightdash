# Embedded dashboard events

Embedded dashboards publish namespaced browser events through two transports:

- SDK embeds dispatch a same-window `CustomEvent` on `window`; the payload is in `event.detail`.
- Direct iframe embeds send a `postMessage` envelope to the validated `targetOrigin`. They also dispatch the `CustomEvent` inside the iframe.

The event system must be enabled in the Lightdash embedding configuration. Direct iframes must include an allowed `targetOrigin` query parameter; wildcard origins are rejected.

| Event                            | Payload                       | Trigger                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lightdash:filterChanged`        | `{ hasFilters, filterCount }` | Deprecated: use `contentStateChanged`. The effective dashboard filter set changes after initial setup.                                                                                                     |
| `lightdash:tabChanged`           | `{ tabIndex }`                | A viewer selects a different visible dashboard tab. Initial tab selection does not emit.                                                                                                                   |
| `lightdash:allTilesLoaded`       | `{ tilesCount, loadTimeMs }`  | Every visible tile settles for the active dashboard load cycle. A new cycle starts when the tab, filters, parameters, date zoom, visible tiles, or refresh counter changes. Failed tiles count as settled. |
| `lightdash:locationChanged`      | `{ pathname, search, href }`  | The direct iframe location changes. SDK embeds do not emit this event.                                                                                                                                     |
| `lightdash:chartSaved`           | `{ chartUuid, action }`       | A chart is created or updated through a direct iframe write flow.                                                                                                                                          |
| `lightdash:dashboardSaved`       | `{ dashboardUuid, action }`   | A dashboard is saved, or an AI agent creates or edits one (for example, adds a chart tile).                                                                                                                |
| `lightdash:contentHeightChanged` | `{ height }`                  | The rendered dashboard height changes, in CSS pixels. Emits once on render, then at most every 150ms while the height changes. Use it to size the iframe to its content.                                   |
| `lightdash:contentStateChanged`  | `{ type, ... }`               | The state the user sees settles after load, and after each change (debounced 300ms). See below.                                                                                                            |

### Content state

`contentStateChanged` tells the host what the user is looking at, for example to export it. The payload's `type` says which shape it is:

- `dashboard`: `{ dashboardUuid, activeTabUuid, dashboard, exportRequest }`. `dashboard` is the dashboard as it is now (`tiles`, `tabs`, `filters`, `parameters`, `config`), with unsaved edits, the filters the user added and the current parameter values. Filter labels are the untranslated ones. `exportRequest` holds the resolved runtime values for an export: `parameters`, plus `tileParameters` when the dashboard uses parameter controls and `dateZoomGranularity` when date zoom is set. Omitted keys must stay omitted.
- `chart`: `{ chartUuid, chart }` for a saved chart in `Lightdash.Chart` with `isEditMode` set. `chart` is the unsaved chart version (`tableName`, `metricQuery`, `parameters`, `chartConfig`, `tableConfig`, `pivotConfig`), unsaved edits included.
- `explore`: `{ chart }` for a query that isn't a saved chart, such as `Lightdash.Explore` or "Explore from here".

`chart` has the saved chart's shape, so hosts can build export options (column order, labels, hidden fields, pivots, totals, conditional formatting) the same way they do for a saved chart.

A host can export what the user sees with `POST /api/v2/dashboards/{uuid}/exports`:

```js
onEvent={(event) => {
    if (event.type === 'contentStateChanged' && event.payload.type === 'dashboard') {
        const { dashboard, exportRequest } = event.payload;
        latestExportRequest = { ...exportRequest, dashboardFilters: dashboard.filters };
    }
}}
```

### Fitting an iframe to its content

```js
window.addEventListener('message', (event) => {
    if (event.origin !== 'https://your-lightdash.example.com') return;
    if (event.data?.type === 'lightdash:contentHeightChanged') {
        iframe.style.height = `${event.data.payload.height}px`;
    }
});
```

### AI agent events

The `AiAgent` SDK component accepts `onEvent` in both render modes. When an agent tool call finishes writing content, the agent emits:

- `chartSaved` with `action: 'created'` or `'updated'` when it creates or edits a saved chart.
- `dashboardSaved` with `action: 'created'` or `'updated'` when it creates or edits a dashboard. Adding a chart to a dashboard emits one event, from the dashboard edit.

Each tool call emits once per page session. SQL charts and documents emit nothing. In iframe mode the SDK relays the iframe's `postMessage` events, so the host origin must be in the event system's allowed origins.

Each event is emitted at most once per user action or load cycle.
