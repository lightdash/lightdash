# Map Chart Reference

Comprehensive guide to creating map visualizations in Lightdash charts-as-code.

## Overview

Map charts allow you to visualize geographical data in Lightdash. They support three visualization types (scatter, area/choropleth, and heatmap) across predefined regions (USA, world, europe) or custom GeoJSON boundaries.

### Use Cases

| Location Type | Description | Best For |
|--------------|-------------|----------|
| `scatter` | Points plotted at lat/lon coordinates | Store locations, event locations, customer addresses |
| `area` | Regions colored by metric value | Sales by state/country, regional performance |
| `heatmap` | Density visualization of point data | User activity hotspots, incident concentrations |

### Map Types

| Map Type | Description | Location Matching |
|----------|-------------|-------------------|
| `USA` | United States map | State names or codes |
| `world` | World map | Country names or ISO codes |
| `europe` | European countries | Country names or ISO codes |
| `custom` | Custom GeoJSON regions | Custom property key |

## Basic Structure

```yaml
chartConfig:
  type: map
  config:
    # Map type and location visualization
    mapType: "USA"              # USA, world, europe, custom
    locationType: "scatter"     # scatter, area, heatmap

    # Data field mappings (depends on locationType)
    latitudeFieldId: "stores_latitude"
    longitudeFieldId: "stores_longitude"
    valueFieldId: "stores_total_sales"

    # Display options
    showLegend: true
    tileBackground: "light"
```

## Configuration Options

### Required Fields by Location Type

**Scatter Maps** (lat/lon points):
```yaml
config:
  locationType: "scatter"
  latitudeFieldId: "field_with_latitude"
  longitudeFieldId: "field_with_longitude"
  valueFieldId: "metric_to_display"      # Optional: for coloring
  sizeFieldId: "metric_for_size"         # Optional: for bubble size
```

**Area Maps** (choropleth):
```yaml
config:
  locationType: "area"
  locationFieldId: "field_with_region_names"
  valueFieldId: "metric_to_display"
  geoJsonPropertyKey: "name"             # Property in GeoJSON to match against
```

**Heatmap** (density visualization):
```yaml
config:
  locationType: "heatmap"
  latitudeFieldId: "field_with_latitude"
  longitudeFieldId: "field_with_longitude"
  valueFieldId: "metric_for_intensity"   # Optional: affects heat intensity
```

### Map Type Configuration

```yaml
# Predefined maps
config:
  mapType: "USA"                  # Built-in US states map
  # OR
  mapType: "world"                # Built-in world countries map
  # OR
  mapType: "europe"               # Built-in European countries map
```

```yaml
# Custom GeoJSON map
config:
  mapType: "custom"
  customGeoJsonUrl: "https://example.com/regions.geojson"
  geoJsonPropertyKey: "region_code"      # Property to match against locationFieldId
```

### Tile Background

```yaml
config:
  tileBackground: "light"         # none, openstreetmap, light, dark, satellite
```

| Value | Description |
|-------|-------------|
| `none` | No background tiles (regions only) |
| `openstreetmap` | OpenStreetMap tiles |
| `light` | Light theme map tiles |
| `dark` | Dark theme map tiles |
| `satellite` | Satellite imagery |

### Color Configuration

```yaml
config:
  # Color gradient (2-5 colors)
  colorRange:
    - "#fee2e2"                   # Low values (light red)
    - "#fca5a5"
    - "#f87171"
    - "#dc2626"
    - "#991b1b"                   # High values (dark red)

  # Background and no-data colors
  backgroundColor: "#ffffff"      # Map background color
  noDataColor: "#e5e7eb"         # Color for regions without data (area maps)
```

### Map View Settings

```yaml
config:
  # Default view (initial position and zoom)
  defaultZoom: 4
  defaultCenterLat: 39.8283
  defaultCenterLon: -98.5795

  # Save user's current view
  saveMapExtent: true             # Preserve zoom/pan when saving
```

### Scatter Map Options

```yaml
config:
  locationType: "scatter"

  # Bubble size configuration
  minBubbleSize: 5                # Minimum bubble radius (pixels)
  maxBubbleSize: 30               # Maximum bubble radius (pixels)
  sizeFieldId: "stores_revenue"   # Metric to determine bubble size

  # Color by metric
  valueFieldId: "stores_profit_margin"
  colorRange:
    - "#dc2626"                   # Negative/low
    - "#fbbf24"                   # Medium
    - "#22c55e"                   # Positive/high
```

### Heatmap Options

```yaml
config:
  locationType: "heatmap"

  heatmapConfig:
    radius: 25                    # Radius of each heat point (pixels)
    blur: 15                      # Blur amount (pixels)
    opacity: 0.6                  # Layer opacity (0-1)

  colorRange:
    - "#3b82f6"                   # Low density (blue)
    - "#fbbf24"                   # Medium density (yellow)
    - "#ef4444"                   # High density (red)
```

### Field Configuration (Tooltips)

```yaml
config:
  fieldConfig:
    stores_store_name:
      visible: true
      label: "Store Name"
    stores_total_sales:
      visible: true
      label: "Total Sales"
    stores_employee_count:
      visible: false              # Hide from tooltip
```

### Legend

```yaml
config:
  showLegend: true                # Show/hide color scale legend
```

## Complete Examples

### Example 1: Store Locations (Scatter Map)

Visualize store locations with bubble size representing revenue.

```yaml
version: 1
name: "Store Locations and Revenue"
slug: store-locations-revenue
spaceSlug: sales/maps
tableName: stores

metricQuery:
  exploreName: stores
  dimensions:
    - stores_store_name
    - stores_city
    - stores_state
  metrics:
    - stores_total_revenue
    - stores_customer_count
  filters:
    stores_is_active:
      operator: equals
      values: [true]
  limit: 500

chartConfig:
  type: map
  config:
    # Map setup
    mapType: "USA"
    locationType: "scatter"
    tileBackground: "light"

    # Location data
    latitudeFieldId: "stores_latitude"
    longitudeFieldId: "stores_longitude"

    # Bubble sizing by revenue
    sizeFieldId: "stores_total_revenue"
    minBubbleSize: 8
    maxBubbleSize: 40

    # Color by customer count
    valueFieldId: "stores_customer_count"
    colorRange:
      - "#dbeafe"
      - "#3b82f6"
      - "#1e40af"

    # Display options
    showLegend: true
    backgroundColor: "#f9fafb"

    # Default view (centered on US)
    defaultZoom: 4
    defaultCenterLat: 39.8283
    defaultCenterLon: -98.5795
    saveMapExtent: true

    # Tooltip configuration
    fieldConfig:
      stores_store_name:
        visible: true
        label: "Store"
      stores_city:
        visible: true
        label: "City"
      stores_state:
        visible: true
        label: "State"
      stores_total_revenue:
        visible: true
        label: "Revenue"
      stores_customer_count:
        visible: true
        label: "Customers"

updatedAt: "2024-01-30T12:00:00Z"
```

### Example 2: Sales by State (Choropleth/Area Map)

Color US states by total sales volume.

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
    - orders_order_count
  sorts:
    - fieldId: orders_total_sales
      descending: true
  limit: 50

chartConfig:
  type: map
  config:
    # Map setup
    mapType: "USA"
    locationType: "area"
    tileBackground: "none"        # No tiles for cleaner area map

    # Region matching
    locationFieldId: "orders_state"
    geoJsonPropertyKey: "name"    # Match against state names

    # Color by sales
    valueFieldId: "orders_total_sales"
    colorRange:
      - "#f0f9ff"                 # Very low sales (light blue)
      - "#bfdbfe"
      - "#60a5fa"
      - "#2563eb"
      - "#1e40af"                 # High sales (dark blue)

    # Display options
    showLegend: true
    backgroundColor: "#ffffff"
    noDataColor: "#f3f4f6"        # Light gray for states without data

    # Tooltip configuration
    fieldConfig:
      orders_state:
        visible: true
        label: "State"
      orders_total_sales:
        visible: true
        label: "Total Sales"
      orders_order_count:
        visible: true
        label: "Orders"

updatedAt: "2024-01-30T12:00:00Z"
```

### Example 3: Customer Activity Heatmap

Show concentration of customer activity across a region.

```yaml
version: 1
name: "Customer Activity Heatmap"
slug: customer-activity-heatmap
spaceSlug: analytics/maps
tableName: events

metricQuery:
  exploreName: events
  dimensions:
    - events_user_id
  metrics:
    - events_event_count
  filters:
    events_event_type:
      operator: equals
      values: ["purchase", "add_to_cart"]
    events_created_date:
      operator: inThePast
      values: [30, "days"]
  limit: 10000

chartConfig:
  type: map
  config:
    # Map setup
    mapType: "USA"
    locationType: "heatmap"
    tileBackground: "dark"        # Dark background for better contrast

    # Location data
    latitudeFieldId: "events_latitude"
    longitudeFieldId: "events_longitude"

    # Heatmap intensity
    valueFieldId: "events_event_count"

    # Heatmap visual settings
    heatmapConfig:
      radius: 20
      blur: 15
      opacity: 0.7

    # Color gradient (blue -> yellow -> red)
    colorRange:
      - "#3b82f6"
      - "#10b981"
      - "#fbbf24"
      - "#f59e0b"
      - "#ef4444"

    # Display options
    showLegend: true
    backgroundColor: "#1f2937"

    # Default view
    defaultZoom: 5
    defaultCenterLat: 37.7749
    defaultCenterLon: -122.4194
    saveMapExtent: false

updatedAt: "2024-01-30T12:00:00Z"
```

### Example 4: Global Sales (World Map)

Visualize sales across countries.

```yaml
version: 1
name: "Global Sales by Country"
slug: global-sales
spaceSlug: sales/international
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_country
  metrics:
    - orders_total_revenue
    - orders_order_count
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 200

chartConfig:
  type: map
  config:
    # Map setup
    mapType: "world"
    locationType: "area"
    tileBackground: "light"

    # Region matching
    locationFieldId: "orders_country"
    geoJsonPropertyKey: "name"    # Match against country names
    # Alternative: use "ISO3166-1-Alpha-3" for ISO country codes

    # Color by revenue
    valueFieldId: "orders_total_revenue"
    colorRange:
      - "#dcfce7"
      - "#86efac"
      - "#22c55e"
      - "#16a34a"
      - "#15803d"

    # Display options
    showLegend: true
    backgroundColor: "#f0f9ff"
    noDataColor: "#e5e7eb"

    # Default view (world view)
    defaultZoom: 2
    defaultCenterLat: 20
    defaultCenterLon: 0
    saveMapExtent: true

    # Tooltip
    fieldConfig:
      orders_country:
        visible: true
        label: "Country"
      orders_total_revenue:
        visible: true
        label: "Revenue"
      orders_order_count:
        visible: true
        label: "Orders"

updatedAt: "2024-01-30T12:00:00Z"
```

### Example 5: Custom Regional Map

Use custom GeoJSON for specific regions (e.g., sales territories).

```yaml
version: 1
name: "Sales by Territory"
slug: sales-by-territory
spaceSlug: sales/maps
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_territory_code
  metrics:
    - orders_total_sales
  limit: 100

chartConfig:
  type: map
  config:
    # Custom GeoJSON map
    mapType: "custom"
    customGeoJsonUrl: "https://storage.example.com/maps/sales-territories.geojson"
    geoJsonPropertyKey: "territory_code"

    # Area visualization
    locationType: "area"
    tileBackground: "openstreetmap"

    # Region matching
    locationFieldId: "orders_territory_code"

    # Color by sales
    valueFieldId: "orders_total_sales"
    colorRange:
      - "#fef3c7"
      - "#fde047"
      - "#facc15"
      - "#eab308"

    # Display
    showLegend: true
    backgroundColor: "#ffffff"
    noDataColor: "#d1d5db"

    # Tooltip
    fieldConfig:
      orders_territory_code:
        visible: true
        label: "Territory"
      orders_total_sales:
        visible: true
        label: "Sales"

updatedAt: "2024-01-30T12:00:00Z"
```

## Data Requirements

### For Scatter and Heatmap Maps

Your data must include:
- Latitude field (numeric, -90 to 90)
- Longitude field (numeric, -180 to 180)
- Optional: metric for coloring points
- Optional: metric for sizing points (scatter only)

```sql
-- Example dbt model for scatter map data
SELECT
    store_id,
    store_name,
    latitude,
    longitude,
    total_revenue,
    customer_count
FROM {{ ref('stores') }}
WHERE is_active = true
```

### For Area/Choropleth Maps

Your data must include:
- Location field matching GeoJSON properties
  - For USA map: State names (e.g., "California", "Texas") or codes
  - For World map: Country names or ISO codes
  - For Custom maps: Values matching your `geoJsonPropertyKey`
- Metric for coloring regions

```sql
-- Example dbt model for area map data
SELECT
    state_name,
    SUM(order_total) as total_sales,
    COUNT(*) as order_count
FROM {{ ref('orders') }}
GROUP BY state_name
```

## GeoJSON Property Keys

### USA Map

Match against state names:
```yaml
geoJsonPropertyKey: "name"        # "California", "Texas", etc.
```

### World Map

Match against country names or ISO codes:
```yaml
geoJsonPropertyKey: "name"        # "United States", "France", etc.
# OR
geoJsonPropertyKey: "ISO3166-1-Alpha-3"  # "USA", "FRA", etc.
```

### Europe Map

Match against country names or codes:
```yaml
geoJsonPropertyKey: "name"        # "Germany", "France", etc.
```

### Custom Maps

Specify the property in your GeoJSON that contains the identifier:
```yaml
geoJsonPropertyKey: "region_code"
# Matches against a property in your GeoJSON like:
# { "type": "Feature", "properties": { "region_code": "NE-1" } }
```

## Best Practices

### Choosing Location Type

**Use Scatter When:**
- You have precise lat/lon coordinates
- Visualizing individual locations (stores, customers, events)
- Want to show size variation (bubble map)
- Point density varies significantly

**Use Area/Choropleth When:**
- Comparing metrics across regions
- Data aggregated by political boundaries
- Showing distribution patterns
- Region comparison is the goal

**Use Heatmap When:**
- Showing density/concentration of points
- Many overlapping points
- Identifying activity hotspots
- Precise locations less important than patterns

### Color Range Guidelines

1. **Sequential** (low to high):
   ```yaml
   colorRange:
     - "#f0f9ff"  # Light
     - "#0284c7"  # Dark
   ```

2. **Diverging** (negative to positive):
   ```yaml
   colorRange:
     - "#dc2626"  # Negative (red)
     - "#f3f4f6"  # Neutral (gray)
     - "#22c55e"  # Positive (green)
   ```

3. **Multi-class** (categories):
   ```yaml
   colorRange:
     - "#3b82f6"  # Blue
     - "#10b981"  # Green
     - "#f59e0b"  # Orange
     - "#ef4444"  # Red
   ```

### Performance Tips

1. **Limit data points**:
   - Scatter: 500-1000 points max for smooth interaction
   - Heatmap: Can handle more (5000+) but test performance
   - Area: Limited by number of regions (usually fine)

2. **Use appropriate aggregation**:
   ```yaml
   metricQuery:
     limit: 1000  # Reasonable limit for maps
   ```

3. **Filter to relevant data**:
   ```yaml
   metricQuery:
     filters:
       stores_is_active:
         operator: equals
         values: [true]
   ```

### Accessibility

1. **Use colorblind-friendly palettes**:
   ```yaml
   colorRange:
     - "#fee2e2"  # Red tints
     - "#dbeafe"  # Blue tints
   ```

2. **Include tooltips with context**:
   ```yaml
   fieldConfig:
     location_name:
       visible: true
       label: "Location"
     metric_value:
       visible: true
       label: "Sales ($)"
   ```

3. **Provide legend**:
   ```yaml
   showLegend: true
   ```

### Data Matching Tips

**For area maps**, ensure your location values match GeoJSON properties:

```yaml
# If your data has "CA" but GeoJSON has "California"
# Transform in dbt:
CASE
  WHEN state_code = 'CA' THEN 'California'
  WHEN state_code = 'TX' THEN 'Texas'
  ...
END as state_name
```

**For international data**, standardize country names:

```yaml
# Use ISO codes for reliability
SELECT
  country_iso_code,  -- Use ISO 3166-1 Alpha-3
  SUM(revenue) as total_revenue
FROM orders
GROUP BY country_iso_code
```

## Common Issues and Solutions

### Issue: Regions not showing data

**Solution**: Check `geoJsonPropertyKey` matches your data field values exactly (case-sensitive).

```yaml
# Debug by listing unique values in your data
SELECT DISTINCT state_name FROM orders;

# Compare with GeoJSON property
# USA map uses full state names: "California", not "CA"
geoJsonPropertyKey: "name"
locationFieldId: "orders_state_name"  # Must match exactly
```

### Issue: Points not appearing on scatter map

**Solution**: Verify latitude/longitude are valid numbers in correct ranges.

```yaml
# Latitude: -90 to 90
# Longitude: -180 to 180

# Check in dbt:
SELECT *
FROM stores
WHERE latitude < -90 OR latitude > 90
   OR longitude < -180 OR longitude > 180
```

### Issue: Map shows but no colors

**Solution**: Ensure `valueFieldId` is in your metric query and contains data.

```yaml
metricQuery:
  metrics:
    - orders_total_sales  # Must be included

chartConfig:
  type: map
  config:
    valueFieldId: "orders_total_sales"  # Must match exactly
```

### Issue: Bubbles all same size

**Solution**: Add `sizeFieldId` or check the field has variation.

```yaml
config:
  sizeFieldId: "stores_revenue"  # Must have varying values
  minBubbleSize: 5
  maxBubbleSize: 30
```

## Map Type Reference

| Map Type | GeoJSON Properties Available | Common Use Cases |
|----------|----------------------------|------------------|
| `USA` | `name` (full state names) | US state-level analysis |
| `world` | `name`, `ISO3166-1-Alpha-3` | Country comparisons |
| `europe` | `name`, country codes | European regional analysis |
| `custom` | User-defined | Sales territories, custom regions |

## Complete Configuration Reference

```yaml
chartConfig:
  type: map
  config:
    # Core configuration
    mapType: "USA"                      # USA, world, europe, custom
    locationType: "scatter"             # scatter, area, heatmap

    # Custom map (if mapType: "custom")
    customGeoJsonUrl: "https://..."
    geoJsonPropertyKey: "property_name"

    # Data field mappings
    latitudeFieldId: "field_name"       # For scatter/heatmap
    longitudeFieldId: "field_name"      # For scatter/heatmap
    locationFieldId: "field_name"       # For area maps
    valueFieldId: "field_name"          # Metric for coloring
    sizeFieldId: "field_name"           # Metric for sizing (scatter)

    # Visual settings
    tileBackground: "light"             # none, openstreetmap, light, dark, satellite
    backgroundColor: "#ffffff"
    noDataColor: "#e5e7eb"             # For area maps
    showLegend: true

    # Color gradient
    colorRange:
      - "#color1"
      - "#color2"
      - "#color3"

    # View settings
    defaultZoom: 4
    defaultCenterLat: 39.8283
    defaultCenterLon: -98.5795
    saveMapExtent: false

    # Scatter-specific
    minBubbleSize: 5
    maxBubbleSize: 30

    # Heatmap-specific
    heatmapConfig:
      radius: 25
      blur: 15
      opacity: 0.6

    # Tooltip configuration
    fieldConfig:
      field_name:
        visible: true
        label: "Display Label"
```

## Related Resources

- [Chart Types Reference](./chart-types-reference.md) - Other visualization types
- [Metrics Reference](./metrics-reference.md) - Creating metrics for maps
- [Dimensions Reference](./dimensions-reference.md) - Location dimensions
