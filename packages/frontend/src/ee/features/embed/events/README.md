# Embedded dashboard events

Embedded dashboards publish namespaced browser events through two transports:

- SDK embeds dispatch a same-window `CustomEvent` on `window`; the payload is in `event.detail`.
- Direct iframe embeds send a `postMessage` envelope to the validated `targetOrigin`. They also dispatch the `CustomEvent` inside the iframe.

The event system must be enabled in the Lightdash embedding configuration. Direct iframes must include an allowed `targetOrigin` query parameter; wildcard origins are rejected.

| Event                       | Payload                       | Trigger                                                                                                                                                                                                    |
| --------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lightdash:filterChanged`   | `{ hasFilters, filterCount }` | The effective dashboard filter set changes after initial setup. Filter values are never included.                                                                                                          |
| `lightdash:tabChanged`      | `{ tabIndex }`                | A viewer selects a different visible dashboard tab. Initial tab selection does not emit.                                                                                                                   |
| `lightdash:allTilesLoaded`  | `{ tilesCount, loadTimeMs }`  | Every visible tile settles for the active dashboard load cycle. A new cycle starts when the tab, filters, parameters, date zoom, visible tiles, or refresh counter changes. Failed tiles count as settled. |
| `lightdash:locationChanged` | `{ pathname, search, href }`  | The direct iframe location changes. SDK embeds do not emit this event.                                                                                                                                     |
| `lightdash:chartSaved`      | `{ chartUuid, action }`       | A chart is created or updated through a direct iframe write flow.                                                                                                                                          |

Each event is emitted at most once per user action or load cycle.
