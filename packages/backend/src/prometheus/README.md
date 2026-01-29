# Custom Metric Manager

A configuration-driven Prometheus metrics system that automatically tracks Lightdash analytics events as Prometheus counters.

## Overview

The `PrometheusEventMetricManager` allows you to define Prometheus metrics in a JSON configuration file. It automatically:
1. Creates Prometheus counters for each configured event
2. Subscribes to LightdashAnalytics track calls
3. Extracts labels from event payloads
4. Increments counters when matching events fire

## Configuration

Create a JSON configuration file (see `custom-metrics.config.example.json` for an example) and set the environment variable:

```bash
export LIGHTDASH_CUSTOM_METRICS_CONFIG_PATH=/path/to/your/config.json
# or
export CUSTOM_METRICS_CONFIG_PATH=/path/to/your/config.json
```

### Configuration Structure

```json
{
  "metrics": [
    {
      "eventName": "user.logged_in",
      "metricName": "lightdash_user_login_total",
      "help": "Total number of user login events",
      "labelNames": ["login_provider"]
    },
    {
      "eventName": "query.executed",
      "metricName": "lightdash_query_executed_total",
      "help": "Total number of query executions",
      "labelNames": ["context", "project_id"]
    }
  ]
}
```

### Configuration Fields

- **eventName**: The Lightdash analytics event name to listen for (e.g., `user.logged_in`, `query.executed`)
- **metricName**: The Prometheus metric name (must follow Prometheus naming conventions)
- **help**: Help text for the Prometheus metric
- **labelNames**: Array of label names to extract from the event payload. These must match the exact property keys in `payload.properties` (e.g., `loginProvider`, `projectId`, `context`)
- **extractLabels** (optional): Custom function to extract labels (not supported in JSON, would need to be added programmatically)

### Label Extraction

By default, labels are extracted from `payload.properties` using the `labelNames` as keys. If a property is missing, the label value will be set to `"unknown"`.

For example, if you configure:
```json
{
  "eventName": "query.executed",
  "labelNames": ["context", "projectId"]
}
```

And an event is tracked with:
```typescript
analytics.track({
  event: 'query.executed',
  properties: {
    context: 'api',
    projectId: 'project-123'
  }
});
```

The counter will be incremented with labels: `{ context: 'api', projectId: 'project-123' }`

## Example Events

Common Lightdash events you can track:

- `user.logged_in` - User login events
- `user.created` - User creation events
- `query.executed` - Query execution events
- `saved_chart.created` - Chart creation events
- `dashboard.created` - Dashboard creation events

See `packages/backend/src/analytics/LightdashAnalytics.ts` for the full list of typed events.

## Usage

1. Create your configuration file based on `custom-metrics.config.example.json`
2. Set the `LIGHTDASH_CUSTOM_METRICS_CONFIG_PATH` environment variable
3. Start Lightdash - the PrometheusEventMetricManager will automatically initialize
4. Metrics will be available at the Prometheus endpoint (default: `http://localhost:9090/metrics`)

## Implementation Details

The PrometheusEventMetricManager:
- Hooks into `LightdashAnalytics.track()` method to intercept events
- Uses the global Prometheus registry (`prom-client`)
- Automatically registers counters with Prometheus
- Handles missing labels gracefully (defaults to "unknown")

## Notes

- The manager only initializes if Prometheus is enabled in Lightdash config
- If the config file is not found or invalid, the manager will log warnings and skip initialization
- The manager must be initialized after Prometheus metrics start (handled automatically in `App.start()`)

