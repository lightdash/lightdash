# Content Verification Reference

Content verification lets teams mark charts and dashboards as trusted, reviewed sources of truth. Verified content displays a verification badge in the Lightdash UI and is preferred by the AI agent when answering questions.

## What Is Verification?

Verification is a project-level seal of approval for charts and dashboards. When content is verified:

- A **verified badge** appears on the chart or dashboard in the UI
- The **AI agent** sees the verification status and prefers verified content when answering questions
- **Chart-as-code exports** include the verification metadata (read-only)
- The **admin panel** lists all verified content for the project

Verification is not the same as access control. It signals quality and trust, not permissions.

## Verification in Chart-as-Code YAML

When you download charts or dashboards with `lightdash download`, verified content includes a `verification` field:

```yaml
# Chart YAML with verification
version: 1
name: "Monthly Revenue"
slug: monthly-revenue
spaceSlug: finance

verification:
  verifiedBy:
    userUuid: "abc-123"
    firstName: "Jane"
    lastName: "Doe"
  verifiedAt: "2025-01-15T10:30:00.000Z"

# ... rest of chart config
```

```yaml
# Dashboard YAML with verification
version: 1
name: "Sales Dashboard"
slug: sales-dashboard
spaceSlug: sales

verification:
  verifiedBy:
    userUuid: "abc-123"
    firstName: "Jane"
    lastName: "Doe"
  verifiedAt: "2025-01-15T10:30:00.000Z"

# ... rest of dashboard config
```

**Important:** The `verification` field is **read-only**. It is populated when downloading content but **ignored on upload**. You cannot verify or unverify content through chart-as-code YAML. Use the Lightdash UI or API instead.

### Unverified Content

Unverified charts and dashboards either omit the `verification` field or set it to `null`:

```yaml
verification: null
```

## Verification Properties

| Property | Type | Description |
|----------|------|-------------|
| `verification` | object or null | Verification status. Null if not verified. |
| `verification.verifiedBy.userUuid` | string | UUID of the user who verified the content |
| `verification.verifiedBy.firstName` | string | First name of the verifier |
| `verification.verifiedBy.lastName` | string | Last name of the verifier |
| `verification.verifiedAt` | string (ISO 8601) | Timestamp when the content was verified |

## How the AI Agent Uses Verification

When users ask the AI agent questions, it searches for relevant charts and dashboards using the `findContent` tool. The search results include verification status for each result:

- **Verified content** is marked with `verified="true"` and includes who verified it and when
- **Unverified content** is marked with `verified="false"`

The AI agent uses these signals to prefer verified content in its responses, giving users answers backed by trusted, reviewed data sources.

## Managing Verification

### Via the UI

1. Open a chart or dashboard
2. Click the three-dot menu (...)
3. Select **Verify content** to add verification, or **Remove verification** to unverify
4. The verification badge appears immediately

### Via the API

```bash
# Verify a chart
curl -X POST \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/content/chart/$CHART_UUID/verification"

# Verify a dashboard
curl -X POST \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/content/dashboard/$DASHBOARD_UUID/verification"

# Remove verification
curl -X DELETE \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/content/chart/$CHART_UUID/verification"

# List all verified content in a project
curl -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/content/verified"
```

### Via the Admin Panel

Project admins can view and manage all verified content from the admin panel:

1. Go to **Settings** > **Verified content**
2. View all verified charts and dashboards
3. Remove verification from any item

## Best Practices

### What to Verify

- **Key business metrics**: Revenue, user counts, conversion rates
- **Executive dashboards**: Content reviewed and approved by leadership
- **Standardized reports**: Reports that follow agreed-upon definitions
- **Single source of truth**: The canonical version when duplicates exist

### What NOT to Verify

- **Exploratory analysis**: Work-in-progress or ad-hoc investigations
- **Personal charts**: Content in personal spaces not meant for broad use
- **Deprecated content**: Charts or dashboards being phased out

### Verification Workflow

1. **Create content** in the UI or via chart-as-code
2. **Review** the data, definitions, and presentation
3. **Verify** once the content meets quality standards
4. **Maintain**: Re-review periodically and unverify if content becomes stale
5. **Download**: Use `lightdash download` to capture verification status in version control

### Using Verification with the AI Agent

To get the best results from the AI agent:

- Verify your most important and accurate charts and dashboards
- The agent will prioritize verified content when multiple results match a query
- Unverify content that becomes outdated so the agent doesn't recommend stale data
