---
name: dashboard-best-practices
description: A guide to building effective, user-friendly dashboards in Lightdash based on data visualization principles and BI best practices.
metadata:
    title: Dashboard Best Practices
---

## Data Visualization Fundamentals

### Choose the Right Chart Type

Match your visualization to the type of insight you're communicating:

| Insight Type         | Recommended Charts                         | Avoid                     |
| -------------------- | ------------------------------------------ | ------------------------- |
| **Trends over time** | Line chart, area chart                     | Pie chart                 |
| **Comparisons**      | Bar chart (horizontal for many categories) | Overloaded charts         |
| **Parts of a whole** | Pie/donut (max 5 segments), stacked bar    | Too many segments         |
| **Correlations**     | Scatter plot                               | Line chart                |
| **Single KPI**       | Big number                                 | Complex charts            |
| **Detailed data**    | Table                                      | Charts with too much data |

### Visual Hierarchy

1. **Most important metrics at the top**: Users scan top-to-bottom, left-to-right
2. **KPIs before details**: Start with summary metrics, then supporting charts
3. **Largest tiles for key insights**: Size indicates importance
4. **Use headings to create sections**: Guide the eye through the story

### Keep It Simple

- **Limit to 5-10 charts per view/tab**: More causes cognitive overload
- **One insight per chart**: Don't overload with multiple y-axes
- **Remove chart junk**: Avoid gridlines, borders, and decorations that don't add meaning
- **Use consistent colors**: Same metric = same color across all charts

### Data Ink Ratio

Maximize the ratio of data to non-data ink:

**Do:**

- Remove unnecessary gridlines
- Use subtle axis lines
- Let data stand out

**Don't:**

- Add heavy borders around charts
- Use gradient fills
- Include decorative images

## Dashboard Layout Principles

### The Inverted Pyramid

Structure dashboards like a news article:

1. **Top**: Critical KPIs and headlines (big numbers)
2. **Middle**: Supporting trends and breakdowns (charts)
3. **Bottom**: Detailed data and drill-downs (tables)

### Common Layout Patterns

**Executive Dashboard:**

```
┌─────────────────────────────────────────────┐
│  KPI  │  KPI  │  KPI  │  KPI  │  (w: 9 each)
├───────────────────────┬─────────────────────┤
│   Main Trend Chart    │   Key Insights      │
│      (w: 24)          │     (w: 12)         │
├───────────────────────┴─────────────────────┤
│           Supporting Charts/Table           │
│                  (w: 36)                    │
└─────────────────────────────────────────────┘
```

**Operational Dashboard:**

```
┌─────────────────────────────────────────────┐
│              Filters Bar                     │
├─────────────────────────────────────────────┤
│  Status KPI │ Status KPI │ Status KPI       │
├─────────────────────────────────────────────┤
│           Real-time/Recent Data Table       │
├─────────────────────────────────────────────┤
│   Trend 1    │   Trend 2    │   Trend 3    │
└─────────────────────────────────────────────┘
```

**Analytical Dashboard:**

```
┌─────────────────────────────────────────────┐
│              Summary Metrics                 │
├─────────────────────────────────────────────┤
│         Primary Analysis Chart              │
├──────────────────────┬──────────────────────┤
│   Breakdown 1        │    Breakdown 2       │
├──────────────────────┴──────────────────────┤
│           Detailed Data Table               │
└─────────────────────────────────────────────┘
```

## Lightdash-Specific Best Practices

### Using Tabs Effectively

Tabs help organize complex dashboards without overwhelming users:

```json
{
    "tabs": [
        {
            "name": "Overview",
            "hidden": false,
            "order": 0,
            "uuid": "1b1f4a7b-7e2d-4e91-8fd7-0d2bb54cb0c1"
        },
        {
            "name": "Trends",
            "hidden": false,
            "order": 1,
            "uuid": "2c2f5b8c-8f3e-4fa2-90e8-1e3cc65dc1d2"
        },
        {
            "name": "Breakdown",
            "hidden": false,
            "order": 2,
            "uuid": "3d3f6c9d-904f-40b3-a1f9-2f4dd76ed2e3"
        },
        {
            "name": "Details",
            "hidden": true,
            "order": 3,
            "uuid": "4e4f7dae-a150-41c4-b20a-3f5ee87fe3f4"
        }
    ]
}
```

**When to use tabs:**

- Dashboard has more than 8-10 tiles
- Content naturally groups into themes
- Different audiences need different views
- Analysis flows from summary to detail
- Some tabs are draft/internal only: set `hidden: true` so editors keep them without exposing them in view mode

**Tab naming tips:**

- Keep names short (1-2 words)
- Use nouns, not verbs ("Overview" not "View Overview")
- Order logically (general → specific)

### Using Headings for Organization

Headings create visual sections within a tab:

```json
{
    "tiles": [
        {
            "h": 1,
            "properties": {
                "text": "Revenue Performance"
            },
            "type": "heading",
            "w": 36,
            "x": 0,
            "y": 0
        },
        {
            "h": 1,
            "properties": {
                "text": "Customer Metrics"
            },
            "type": "heading",
            "w": 36,
            "x": 0,
            "y": 8
        }
    ]
}
```

**When to use headings:**

- Grouping related charts within a tab
- Separating logical sections
- Creating a table of contents feel

### Using Markdown Tiles

Markdown tiles add context, explanations, and guidance:

**Use markdown for:**

- Explaining what the dashboard shows
- Highlighting key insights
- Providing interpretation guidance
- Adding links to related resources
- Documenting data sources or caveats

```json
{
    "h": 6,
    "properties": {
        "content": "## Purpose\n\nThis dashboard tracks **weekly sales performance**\nagainst targets.\n\n## Key Metrics\n\n- **Revenue**: Total invoiced amount\n- **Pipeline**: Weighted opportunity value\n\n## Data Freshness\n\nUpdated every 4 hours from Salesforce.\n\n---\n\nQuestions? Contact [analytics@company.com](mailto:analytics@company.com)",
        "title": "About This Dashboard"
    },
    "type": "markdown",
    "w": 12,
    "x": 24,
    "y": 0
}
```

**Markdown tips:**

- Don't overdo it: Keep explanations concise
- Use formatting: Bold for emphasis, headers for structure
- Include links: To documentation, related dashboards, or contacts
- Consider collapsible sections for lengthy explanations

**Rich HTML in markdown:**
Lightdash supports HTML within markdown for advanced formatting:

```json
{
    "content": "<div style=\"background: #f0f9ff; padding: 16px; border-radius: 8px;\">\n  <strong>Note:</strong> Q4 data includes estimated values for December.\n</div>"
}
```

### Filter Best Practices

#### Choose Appropriate Filter Defaults

Filters with no default value (`values: []`) mean "any value" - the filter is visible but not applied. This is useful for **suggested filters** that users can optionally apply without affecting the initial dashboard view.

Filters with default values are better when the filter **should be active** on load:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Date Range",
                "operator": "inThePast",
                "settings": {
                    "completed": false,
                    "unitOfTime": "days"
                },
                "target": {
                    "fieldId": "orders_created_at",
                    "tableName": "orders"
                },
                "values": [90]
            },
            {
                "label": "Region",
                "operator": "equals",
                "target": {
                    "fieldId": "orders_region",
                    "tableName": "orders"
                },
                "values": [],
                "disabled": true
            }
        ]
    }
}
```

**When to use default values:**

- Time filters that should constrain data (e.g., last 90 days)
- Status filters where you want to show active/open items by default
- Any filter that meaningfully improves the initial view

**When to omit default values:**

- Suggested filters users might want but aren't essential
- Filters where "all" is the sensible starting point
- Exploratory dashboards where users should choose their own scope

**Tip:** Prefer a filter with a sensible default over a required filter with no value - it's a better user experience to show data immediately rather than forcing a selection.

#### Use Required Filters When Appropriate

Required filters ensure the dashboard only shows when context is provided:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Select Account",
                "operator": "equals",
                "required": true,
                "target": {
                    "fieldId": "customers_account_id",
                    "tableName": "customers"
                },
                "values": []
            }
        ]
    }
}
```

**When to require filters:**

- Dashboard only makes sense for a specific context (e.g., account, region)
- Data volume is too large without filtering
- Security/privacy requires explicit selection

#### Limit Filter Count

- 3-5 primary filters is ideal
- Too many filters confuse users
- Use tabs to separate different filter contexts
- Consider which filters apply to all charts vs. specific tiles

### Content Organization Tips

#### Tell a Story

Structure the dashboard to answer questions in order:

1. **What happened?** (KPIs, summary metrics)
2. **Why did it happen?** (Breakdowns, trends)
3. **What should we do?** (Insights, recommendations in markdown)
4. **What's the detail?** (Tables for drill-down)

#### Design for Your Audience

| Audience             | Focus On                            | Avoid                              |
| -------------------- | ----------------------------------- | ---------------------------------- |
| **Executives**       | KPIs, trends, summaries             | Technical details, too many charts |
| **Analysts**         | Breakdowns, filters, drill-downs    | Oversimplification                 |
| **Operations**       | Current status, exceptions, actions | Historical trends                  |
| **Self-serve users** | Clear labels, explanations          | Jargon, assumed knowledge          |

#### Maintain Consistency

- **Same metric, same name**: Don't call it "Revenue" in one place and "Sales" in another
- **Same color scheme**: Use consistent colors for the same dimensions across charts
- **Same time grain**: If one chart shows monthly data, don't mix in daily without explanation
- **Same filters**: Dashboard filters should apply consistently (use `tileTargets` for exceptions)

## Performance Considerations

### Optimize for Load Time

1. **Limit tile count**: Each tile is a query
2. **Use appropriate limits**: Don't return 10,000 rows for a chart
3. **Pre-filter in the model**: Remove irrelevant historical data
4. **Use tabs**: Only visible tab queries run initially

### Query Efficiency

- **Avoid SELECT \***: Only include needed dimensions and metrics
- **Use date filters**: Time-bound queries are faster
- **Consider aggregation**: Pre-aggregate in dbt for common views

## Common Mistakes to Avoid

### Layout Mistakes

- **Using w: 24 or less for full-width**: The grid is 36 columns, use `w: 36`
- **Cramming too much**: Leave visual breathing room
- **Inconsistent heights**: Charts at the same level should have the same height
- **Poor mobile experience**: Test on smaller screens

### Visualization Mistakes

- **Pie charts with too many segments**: Max 5, use bar chart otherwise
- **Truncated y-axes**: Can exaggerate small changes
- **Missing context**: Numbers without comparison are meaningless
- **Dual y-axes**: Hard to interpret, use separate charts

### Content Mistakes

- **No explanations**: Users shouldn't have to guess what metrics mean
- **Stale data without indication**: Show data freshness
- **Missing time filter defaults**: Dashboard loads with too much data when a date range should be applied
- **Mixing audiences**: Exec summary next to analyst deep-dive

## Dashboard Checklist

Before publishing, verify:

- [ ] KPIs are at the top
- [ ] Chart types match the data/insight
- [ ] Filters that should be active have sensible defaults
- [ ] Required filters are set where needed
- [ ] Tabs are used if >10 tiles
- [ ] Headings separate logical sections
- [ ] Markdown explains purpose and key insights
- [ ] Colors are consistent across charts
- [ ] Full width (w: 36) is used where appropriate
- [ ] Dashboard loads in reasonable time
- [ ] Works on different screen sizes
- [ ] All charts have clear titles
- [ ] Data freshness is indicated if relevant
