# Dashboard Best Practices

A guide to building effective, user-friendly dashboards in Lightdash based on data visualization principles and BI best practices.

## Data Visualization Fundamentals

### Choose the Right Chart Type

Match your visualization to the type of insight you're communicating:

| Insight Type | Recommended Charts | Avoid |
|-------------|-------------------|-------|
| **Trends over time** | Line chart, area chart | Pie chart |
| **Comparisons** | Bar chart (horizontal for many categories) | Overloaded charts |
| **Parts of a whole** | Pie/donut (max 5 segments), stacked bar | Too many segments |
| **Correlations** | Scatter plot | Line chart |
| **Single KPI** | Big number | Complex charts |
| **Detailed data** | Table | Charts with too much data |

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

```yaml
tabs:
  - uuid: "overview"
    name: "Overview"      # Start with high-level view
    order: 0
  - uuid: "trends"
    name: "Trends"        # Time-based analysis
    order: 1
  - uuid: "breakdown"
    name: "Breakdown"     # Dimensional analysis
    order: 2
  - uuid: "details"
    name: "Details"       # Detailed data tables
    order: 3
```

**When to use tabs:**
- Dashboard has more than 8-10 tiles
- Content naturally groups into themes
- Different audiences need different views
- Analysis flows from summary to detail

**Tab naming tips:**
- Keep names short (1-2 words)
- Use nouns, not verbs ("Overview" not "View Overview")
- Order logically (general → specific)

### Using Headings for Organization

Headings create visual sections within a tab:

```yaml
tiles:
  - type: heading
    x: 0
    y: 0
    w: 36
    h: 1
    properties:
      text: "Revenue Performance"

  # Revenue charts below...

  - type: heading
    x: 0
    y: 8
    w: 36
    h: 1
    properties:
      text: "Customer Metrics"

  # Customer charts below...
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

```yaml
- type: markdown
  x: 24
  y: 0
  w: 12
  h: 6
  properties:
    title: "About This Dashboard"
    content: |
      ## Purpose

      This dashboard tracks **weekly sales performance**
      against targets.

      ## Key Metrics

      - **Revenue**: Total invoiced amount
      - **Pipeline**: Weighted opportunity value

      ## Data Freshness

      Updated every 4 hours from Salesforce.

      ---

      Questions? Contact [analytics@company.com](mailto:analytics@company.com)
```

**Markdown tips:**
- Don't overdo it: Keep explanations concise
- Use formatting: Bold for emphasis, headers for structure
- Include links: To documentation, related dashboards, or contacts
- Consider collapsible sections for lengthy explanations

**Rich HTML in markdown:**
Lightdash supports HTML within markdown for advanced formatting:

```yaml
content: |
  <div style="background: #f0f9ff; padding: 16px; border-radius: 8px;">
    <strong>Note:</strong> Q4 data includes estimated values for December.
  </div>
```

### Filter Best Practices

#### Choose Appropriate Filter Defaults

Filters with no default value (`values: []`) mean "any value" - the filter is visible but not applied. This is useful for **suggested filters** that users can optionally apply without affecting the initial dashboard view.

Filters with default values are better when the filter **should be active** on load:

```yaml
filters:
  dimensions:
    # Filter WITH default - active on load
    - target:
        fieldId: orders_created_at
        tableName: orders
      operator: inThePast
      values: [90]              # Default: Last 90 days
      settings:
        unitOfTime: days
        completed: false
      label: "Date Range"

    # Filter WITHOUT default - suggested but not applied
    - target:
        fieldId: orders_region
        tableName: orders
      operator: equals
      values: []                # No default = show all regions
      label: "Region"
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

```yaml
filters:
  dimensions:
    - target:
        fieldId: customers_account_id
        tableName: customers
      operator: equals
      values: []
      required: true           # User must select
      label: "Select Account"
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

| Audience | Focus On | Avoid |
|----------|----------|-------|
| **Executives** | KPIs, trends, summaries | Technical details, too many charts |
| **Analysts** | Breakdowns, filters, drill-downs | Oversimplification |
| **Operations** | Current status, exceptions, actions | Historical trends |
| **Self-serve users** | Clear labels, explanations | Jargon, assumed knowledge |

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

- **Avoid SELECT ***: Only include needed dimensions and metrics
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
