# Map Chart Reference

Guide to creating map visualizations in Lightdash charts-as-code.

> For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/mapChart`.

## Overview

Map charts visualize geographical data with three location types:

| Location Type | Description | Best For |
|--------------|-------------|----------|
| `scatter` | Points at lat/lon coordinates | Store locations, customer addresses |
| `area` | Regions colored by metric (choropleth) | Sales by state/country |
| `heatmap` | Density visualization | Activity hotspots |

### Map Types

| Map Type | Description | Location Matching |
|----------|-------------|-------------------|
| `USA` | United States map | State names or codes |
| `world` | World map | Country names or ISO codes |
| `europe` | European countries | Country names or ISO codes |
| `custom` | Custom GeoJSON regions | Custom property key |

## Key Configuration Properties

### Location Type Settings

**Scatter Maps** require latitude and longitude fields:
```yaml
config:
  locationType: "scatter"
  latitudeFieldId: "stores_latitude"
  longitudeFieldId: "stores_longitude"
  valueFieldId: "metric_for_color"      # Optional
  sizeFieldId: "metric_for_bubble_size" # Optional
```

**Area Maps** match region names to GeoJSON:
```yaml
config:
  locationType: "area"
  locationFieldId: "orders_state"
  valueFieldId: "orders_total_sales"
  geoJsonPropertyKey: "name"
```

**Heatmaps** show point density:
```yaml
config:
  locationType: "heatmap"
  latitudeFieldId: "events_latitude"
  longitudeFieldId: "events_longitude"
  valueFieldId: "metric_for_intensity"  # Optional
```

### Visual Settings

```yaml
config:
  tileBackground: "light"       # none, openstreetmap, light, dark, satellite
  showLegend: true
  colorRange:
    - "#fee2e2"                 # Low values
    - "#dc2626"                 # High values
  backgroundColor: "#ffffff"
  noDataColor: "#e5e7eb"        # For area maps
```

### View Settings

```yaml
config:
  defaultZoom: 4
  defaultCenterLat: 39.8283
  defaultCenterLon: -98.5795
  saveMapExtent: true
```

## Examples

### Example 1: Store Locations (Scatter Map)

```yaml
version: 1
name: "Store Locations"
slug: store-locations
spaceSlug: sales/maps
tableName: stores

metricQuery:
  exploreName: stores
  dimensions:
    - stores_store_name
    - stores_city
  metrics:
    - stores_total_revenue
  limit: 500

chartConfig:
  type: map
  config:
    mapType: "USA"
    locationType: "scatter"
    tileBackground: "light"
    latitudeFieldId: "stores_latitude"
    longitudeFieldId: "stores_longitude"
    sizeFieldId: "stores_total_revenue"
    minBubbleSize: 8
    maxBubbleSize: 40
    colorRange:
      - "#dbeafe"
      - "#1e40af"
    showLegend: true
    defaultZoom: 4
    defaultCenterLat: 39.8283
    defaultCenterLon: -98.5795

updatedAt: "2024-01-30T12:00:00Z"
```

### Example 2: Sales by State (Choropleth)

```yaml
version: 1
name: "Sales by State"
slug: sales-by-state
spaceSlug: sales/maps
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_state
  metrics:
    - orders_total_sales
  limit: 50

chartConfig:
  type: map
  config:
    mapType: "USA"
    locationType: "area"
    tileBackground: "none"
    locationFieldId: "orders_state"
    geoJsonPropertyKey: "name"
    valueFieldId: "orders_total_sales"
    colorRange:
      - "#f0f9ff"
      - "#2563eb"
    showLegend: true
    noDataColor: "#f3f4f6"

updatedAt: "2024-01-30T12:00:00Z"
```

## Data Requirements

### For Scatter and Heatmap Maps

- Latitude field (numeric, -90 to 90)
- Longitude field (numeric, -180 to 180)
- Optional metric for coloring or sizing

### For Area/Choropleth Maps

- Location field matching GeoJSON properties:
  - USA map: State names ("California", "Texas")
  - World map: Country names or ISO codes
  - Custom maps: Values matching `geoJsonPropertyKey`
- Metric for coloring regions

## GeoJSON Property Keys

| Map Type | Property Key | Example Values |
|----------|--------------|----------------|
| USA | `name` | "California", "Texas" |
| World | `name` | "United States", "France" |
| World | `ISO3166-1-Alpha-3` | "USA", "FRA" |
| Europe | `name` | "Germany", "France" |
| Custom | User-defined | Matches your GeoJSON |

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
```yaml
colorRange: ["#f0f9ff", "#0284c7"]
```

**Diverging** (negative to positive): Two colors through neutral
```yaml
colorRange: ["#dc2626", "#f3f4f6", "#22c55e"]
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Regions not showing data | Check `geoJsonPropertyKey` matches data exactly (case-sensitive) |
| Points not appearing | Verify lat/lon are valid (-90 to 90, -180 to 180) |
| No colors showing | Ensure `valueFieldId` is in your metric query |
| Bubbles all same size | Add `sizeFieldId` with varying values |

## Related Resources

- [Chart Types Reference](./chart-types-reference.md) - Other visualization types
- [Metrics Reference](./metrics-reference.md) - Creating metrics for maps
- [Dimensions Reference](./dimensions-reference.md) - Location dimensions
