---
name: map-chart-reference
description: Map chart configuration for scatter, area, and heatmap layers, plus map-specific examples for Lightdash charts.
---

# Map Chart Reference

Guide to creating map visualizations in Lightdash JSON charts.

## Overview

Map charts visualize geographical data with three location types:

| Location Type | Description                            | Best For                            |
| ------------- | -------------------------------------- | ----------------------------------- |
| `scatter`     | Points at lat/lon coordinates          | Store locations, customer addresses |
| `area`        | Regions colored by metric (choropleth) | Sales by state/country              |
| `heatmap`     | Density visualization                  | Activity hotspots                   |

### Map Types

| Map Type | Description            | Location Matching          |
| -------- | ---------------------- | -------------------------- |
| `USA`    | United States map      | State names or codes       |
| `world`  | World map              | Country names or ISO codes |
| `europe` | European countries     | Country names or ISO codes |
| `custom` | Custom GeoJSON regions | Custom property key        |

## Key Configuration Properties

### Location Type Settings

**Scatter Maps** require latitude and longitude fields:

```json
{
    "config": {
        "latitudeFieldId": "stores_latitude",
        "locationType": "scatter",
        "longitudeFieldId": "stores_longitude",
        "sizeFieldId": "metric_for_bubble_size",
        "valueFieldId": "metric_for_color"
    }
}
```

**Area Maps** match region names to GeoJSON:

```json
{
    "config": {
        "geoJsonPropertyKey": "name",
        "locationFieldId": "orders_state",
        "locationType": "area",
        "valueFieldId": "orders_total_sales"
    }
}
```

**Heatmaps** show point density:

```json
{
    "config": {
        "heatmapConfig": {
            "blur": 15,
            "opacity": 0.6,
            "radius": 25
        },
        "latitudeFieldId": "events_latitude",
        "locationType": "heatmap",
        "longitudeFieldId": "events_longitude",
        "valueFieldId": "metric_for_intensity"
    }
}
```

### Custom GeoJSON (Area Maps)

```json
{
    "config": {
        "customGeoJsonUrl": "https://example.com/regions.geojson",
        "geoJsonPropertyKey": "postal_code",
        "locationFieldId": "orders_zip_code",
        "locationType": "area",
        "mapType": "custom",
        "valueFieldId": "orders_total_sales"
    }
}
```

### Visual Settings

```json
{
    "config": {
        "backgroundColor": "#ffffff",
        "colorOverrides": {
            "California": "#ff0000",
            "Texas": "#00ff00"
        },
        "colorRange": ["#fee2e2", "#dc2626"],
        "dataLayerOpacity": 0.8,
        "noDataColor": "#e5e7eb",
        "showLegend": true,
        "tileBackground": "light"
    }
}
```

### Tooltip Settings

```json
{
    "config": {
        "fieldConfig": {
            "stores_revenue": {
                "visible": false
            },
            "stores_store_name": {
                "label": "Store",
                "visible": true
            }
        }
    }
}
```

### View Settings

```json
{
    "config": {
        "defaultCenterLat": 39.8283,
        "defaultCenterLon": -98.5795,
        "defaultZoom": 4,
        "saveMapExtent": true
    }
}
```

## Examples

### Example 1: Store Locations (Scatter Map)

```json
{
    "chartConfig": {
        "config": {
            "colorRange": ["#dbeafe", "#1e40af"],
            "defaultCenterLat": 39.8283,
            "defaultCenterLon": -98.5795,
            "defaultZoom": 4,
            "latitudeFieldId": "stores_latitude",
            "locationType": "scatter",
            "longitudeFieldId": "stores_longitude",
            "mapType": "USA",
            "maxBubbleSize": 40,
            "minBubbleSize": 8,
            "showLegend": true,
            "sizeFieldId": "stores_total_revenue",
            "tileBackground": "light"
        },
        "type": "map"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["stores_store_name", "stores_city"],
        "exploreName": "stores",
        "limit": 500,
        "metrics": ["stores_total_revenue"]
    },
    "name": "Store Locations",
    "slug": "store-locations",
    "spaceSlug": "sales/maps",
    "tableName": "stores",
    "version": 1
}
```

### Example 2: Sales by State (Choropleth)

```json
{
    "chartConfig": {
        "config": {
            "colorRange": ["#f0f9ff", "#2563eb"],
            "geoJsonPropertyKey": "name",
            "locationFieldId": "orders_state",
            "locationType": "area",
            "mapType": "USA",
            "noDataColor": "#f3f4f6",
            "showLegend": true,
            "tileBackground": "none",
            "valueFieldId": "orders_total_sales"
        },
        "type": "map"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_state"],
        "exploreName": "orders",
        "limit": 50,
        "metrics": ["orders_total_sales"]
    },
    "name": "Sales by State",
    "slug": "sales-by-state",
    "spaceSlug": "sales/maps",
    "tableName": "orders",
    "version": 1
}
```

### Example 3: Event Heatmap

```json
{
    "chartConfig": {
        "config": {
            "colorRange": ["#fef9c3", "#f59e0b", "#dc2626"],
            "defaultCenterLat": 40.7128,
            "defaultCenterLon": -74.006,
            "defaultZoom": 11,
            "heatmapConfig": {
                "blur": 15,
                "opacity": 0.6,
                "radius": 25
            },
            "latitudeFieldId": "events_latitude",
            "locationType": "heatmap",
            "longitudeFieldId": "events_longitude",
            "showLegend": true,
            "tileBackground": "dark"
        },
        "type": "map"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["events_latitude", "events_longitude"],
        "exploreName": "events",
        "limit": 5000,
        "metrics": []
    },
    "name": "Event Density",
    "slug": "event-density",
    "spaceSlug": "analytics",
    "tableName": "events",
    "version": 1
}
```

### Example 4: Custom GeoJSON Regions

```json
{
    "chartConfig": {
        "config": {
            "colorRange": ["#e0f2fe", "#0369a1"],
            "customGeoJsonUrl": "https://example.com/zip-codes.geojson",
            "geoJsonPropertyKey": "ZCTA5CE10",
            "locationFieldId": "orders_zip_code",
            "locationType": "area",
            "mapType": "custom",
            "noDataColor": "#f3f4f6",
            "showLegend": true,
            "tileBackground": "light",
            "valueFieldId": "orders_total_sales"
        },
        "type": "map"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_zip_code"],
        "exploreName": "orders",
        "limit": 500,
        "metrics": ["orders_total_sales"]
    },
    "name": "Sales by Zip Code",
    "slug": "sales-by-zip",
    "spaceSlug": "sales/maps",
    "tableName": "orders",
    "version": 1
}
```

## Data Requirements

### For Scatter and Heatmap Maps

- Latitude field (numeric, -90 to 90)
- Longitude field (numeric, -180 to 180)
- Optional metric for coloring or sizing

### For Area/Choropleth Maps

- Location field matching GeoJSON properties:
    - USA map: State names ("California", "Texas")
    - World map: Country names or ISO 3166-1 alpha-3 codes ("USA", "GBR")
    - Europe map: Country names or ISO codes
    - Custom maps: Values matching `geoJsonPropertyKey` from your GeoJSON URL
- Metric for coloring regions
- Addresses must be geocoded to region identifiers before mapping

## GeoJSON Property Keys

| Map Type | Property Key        | Example Values            |
| -------- | ------------------- | ------------------------- |
| USA      | `name`              | "California", "Texas"     |
| World    | `name`              | "United States", "France" |
| World    | `ISO3166-1-Alpha-3` | "USA", "FRA"              |
| Europe   | `name`              | "Germany", "France"       |
| Custom   | User-defined        | Matches your GeoJSON      |

## All Config Properties

| Property                | Type                                                          | Applies To       | Description                         |
| ----------------------- | ------------------------------------------------------------- | ---------------- | ----------------------------------- |
| `locationType`          | `scatter` \| `area` \| `heatmap`                              | All              | How location data is displayed      |
| `mapType`               | `USA` \| `world` \| `europe` \| `custom`                      | All              | Predefined map region               |
| `latitudeFieldId`       | string                                                        | scatter, heatmap | Field with latitude values          |
| `longitudeFieldId`      | string                                                        | scatter, heatmap | Field with longitude values         |
| `locationFieldId`       | string                                                        | area             | Field matching GeoJSON properties   |
| `geoJsonPropertyKey`    | string                                                        | area             | GeoJSON property to match against   |
| `customGeoJsonUrl`      | string                                                        | area (custom)    | URL to custom GeoJSON file          |
| `valueFieldId`          | string                                                        | All              | Field for color intensity           |
| `sizeFieldId`           | string                                                        | scatter          | Field for bubble sizing             |
| `minBubbleSize`         | number                                                        | scatter          | Minimum bubble size                 |
| `maxBubbleSize`         | number                                                        | scatter          | Maximum bubble size                 |
| `colorRange`            | string[]                                                      | All              | Gradient colors (2-5 hex values)    |
| `colorOverrides`        | Record                                                        | area             | Per-region color overrides          |
| `noDataColor`           | string                                                        | area             | Color for regions without data      |
| `backgroundColor`       | string                                                        | All              | Map background color                |
| `tileBackground`        | `none` \| `openstreetmap` \| `light` \| `dark` \| `satellite` | All              | Base map tile layer                 |
| `dataLayerOpacity`      | number                                                        | All              | Data layer opacity (0-1)            |
| `showLegend`            | boolean                                                       | All              | Show/hide legend                    |
| `heatmapConfig.radius`  | number                                                        | heatmap          | Heat point size (1-50)              |
| `heatmapConfig.blur`    | number                                                        | heatmap          | Blur amount (0-30)                  |
| `heatmapConfig.opacity` | number                                                        | heatmap          | Heatmap overlay opacity (0.1-1)     |
| `fieldConfig`           | Record                                                        | All              | Tooltip field visibility and labels |
| `defaultZoom`           | number                                                        | All              | Initial zoom level                  |
| `defaultCenterLat`      | number                                                        | All              | Initial center latitude             |
| `defaultCenterLon`      | number                                                        | All              | Initial center longitude            |
| `saveMapExtent`         | boolean                                                       | All              | Preserve zoom/pan on save           |

## Best Practices

### Choosing Location Type

- **Scatter**: Precise coordinates, individual locations, bubble sizing needed
- **Area**: Comparing metrics across regions, political boundary analysis
- **Heatmap**: Density patterns, many overlapping points

### Performance

- Scatter: Limit to 500-1000 points
- Heatmap: Can handle 5000+ points
- Area: Limited by number of regions (usually fine)

### Color Guidelines

**Sequential** (low to high): Light to dark of same hue

```json
{
    "colorRange": ["#f0f9ff", "#0284c7"]
}
```

**Diverging** (negative to positive): Two colors through neutral

```json
{
    "colorRange": ["#dc2626", "#f3f4f6", "#22c55e"]
}
```

## Common Issues

| Issue                         | Solution                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| Regions not showing data      | Check `geoJsonPropertyKey` matches data exactly (case-sensitive)        |
| Points not appearing          | Verify lat/lon are valid (-90 to 90, -180 to 180)                       |
| No colors showing             | Ensure `valueFieldId` is in your metric query                           |
| Bubbles all same size         | Add `sizeFieldId` with varying values                                   |
| Custom GeoJSON not loading    | Verify URL is publicly accessible and returns valid GeoJSON             |
| Heatmap too faint             | Increase `opacity` (up to 1) and `radius` (up to 50) in `heatmapConfig` |
| Tooltips showing wrong fields | Use `fieldConfig` to set `visible: false` on unwanted fields            |
