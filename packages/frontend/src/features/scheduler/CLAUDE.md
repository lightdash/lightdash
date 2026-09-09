<summary>
React components for creating and managing scheduled deliveries in Lightdash. Handles scheduling dashboard and chart exports via email, Slack, Microsoft Teams, and Google Sheets with support for filters, parameters, custom formatting, and delivery frequency options.
</summary>

<howToUse>
The scheduler feature is accessed through modal components that allow users to create, edit, and manage scheduled deliveries. Components are designed to work with both dashboard and chart resources.

Key components:

- `SchedulerModalContent` - Main modal wrapper for creating/editing schedulers
- `SchedulerForm` - Core form with delivery configuration (format, targets, frequency)
- `SchedulerFormFiltersTab` - Adjust the dashboard's saved filters for a delivery
- `SchedulerFormChartFilterOverridesTab` - Adjust the chart's saved filters for a delivery
- `SchedulerFormChartFiltersTab` - Threshold alerts only: full filter builder that adds filters to the chart query
- `SchedulerParameters` - Configure parameter overrides for deliveries
- `SchedulerPreview` - Preview dashboard appearance for image deliveries

The scheduler supports three delivery formats:

- **CSV/XLSX** - Exports chart/dashboard data as spreadsheet files
- **IMAGE** - Captures dashboard screenshot as image (with optional PDF)
- **GSHEETS** - Uploads data directly to Google Sheets

Delivery targets include email, Slack channels, Microsoft Teams webhooks, and Google Sheets.
</howToUse>

<codeExample>

```typescript
// Basic scheduler modal usage
<SchedulerModalContent
    resource={{ type: 'dashboard', uuid: dashboardUuid }}
    isOpen={isModalOpen}
    onClose={() => setIsModalOpen(false)}
    onSubmit={handleSchedulerSubmit}
/>

// Editing existing scheduler
<SchedulerModalContent
    resource={{ type: 'chart', uuid: chartUuid }}
    savedSchedulerData={existingScheduler}
    isOpen={isEditModalOpen}
    onClose={handleClose}
    onSubmit={handleUpdate}
/>

// Standalone parameter configuration
<SchedulerParameters
    dashboard={dashboard}
    schedulerParameters={formValues.parameters}
    onChange={(params) => setFormFieldValue('parameters', params)}
/>
```

</codeExample>

<importantToKnow>
- **Parameter Inheritance**: Scheduler parameters inherit current dashboard parameter values and only show as "changed" when explicitly modified by the user
- **Filter Overrides**: Deliveries adjust the values of the resource's existing filters, they do not add new ones. Dashboards store `DashboardFilterRule[]` (applied with `applyDimensionOverrides`); charts store `Filters` (applied with `applyChartFilterOverrides`, which replaces saved rules by id and falls back to the same field). A removed override means the delivery uses the saved default. Overrides that match nothing are ANDed on, which is how threshold alerts add filters
- **Format-Specific Options**: Each delivery format has specific configuration options (CSV formatting, image viewport width, etc.)
- **Target Validation**: Email addresses and webhook URLs are validated before scheduler creation
- **Timezone Support**: Schedulers use project timezone by default but can be overridden
- **Send Now**: Schedulers can be tested immediately with "Send Now" functionality before saving
- **Threshold Alerts**: Special scheduler type that only sends when chart values meet specified conditions
- **Tab Selection**: Dashboard schedulers can target specific tabs or include all tabs
- **Authentication**: Slack and Google Sheets require proper OAuth integration and permissions
</importantToKnow>

<links>
- Scheduler API types: @/packages/common/src/types/scheduler.ts
- Scheduler backend logic: @/packages/backend/src/scheduler/SchedulerTask.ts
- Parameter components: @/packages/frontend/src/features/parameters/components/
- Filter components: @/packages/frontend/src/components/DashboardFilter/
- Slack integration: @/packages/frontend/src/hooks/slack/useSlack.ts
</links>
