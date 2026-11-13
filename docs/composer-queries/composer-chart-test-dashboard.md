# Test composer dashboard

Creates a dashboard holding one composer chart tile on a preview or local
instance, for proofs and manual checks. Needs the `composer-charts` flag on
(it is on in previews) and a personal access token of an editor or above.

```bash
export SITE_URL=https://<preview>.lightdash.dev LDPAT=<token>
export PROJECT=3675b69e-8324-4110-bdca-059031aa8da3 # seeded Jaffle shop

# 1. A new dashboard. Never use a seeded one: content-as-code and promotion tests read them.
DASHBOARD=$(curl -s -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  "$SITE_URL/api/v1/projects/$PROJECT/dashboards" \
  -d '{"name":"Composer test dashboard","tiles":[],"tabs":[]}' | jq -r .results.uuid)

# 2. The composer chart, owned by that dashboard.
CHART=$(curl -s -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  "$SITE_URL/api/v2/projects/$PROJECT/composer-charts" -d @- <<EOF | jq -r .results.uuid
{
  "dashboardUuid": "$DASHBOARD",
  "name": "Orders by status",
  "pipeline": {
    "schemaVersion": 1,
    "terminalNodeId": "orders",
    "nodes": [{
      "sourceType": "semanticLayer", "nodeId": "orders", "title": "Orders by status",
      "exploreName": "orders",
      "dimensions": ["orders_status"], "metrics": ["orders_total_order_amount"]
    }]
  },
  "chart": {
    "schemaVersion": 1,
    "columns": [
      {"reference": "orders_status", "fieldType": "dimension"},
      {"reference": "orders_total_order_amount", "fieldType": "metric"}
    ],
    "chartConfig": {"type": "cartesian", "config": {
      "layout": {"xField": "orders_status", "yField": ["orders_total_order_amount"]},
      "eChartsConfig": {}
    }},
    "pivotConfig": null,
    "tableConfig": {"columnOrder": ["orders_status", "orders_total_order_amount"]}
  }
}
EOF
)

# 3. Its tile, through the ordinary dashboard update.
curl -s -X PATCH -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  "$SITE_URL/api/v1/dashboards/$DASHBOARD" -d @- <<EOF
{"tabs": [], "filters": {"dimensions": [], "metrics": [], "tableCalculations": []},
 "tiles": [{"type": "composer_chart", "x": 0, "y": 0, "h": 9, "w": 12,
            "properties": {"title": "Orders", "composerChartUuid": "$CHART", "chartName": null}}]}
EOF
```

Delete the dashboard when done.
