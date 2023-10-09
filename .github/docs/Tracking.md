# Tracking

We are all data people, so you know we love charts ❤️📊 ...and to build charts we need data 😝

## Summary

On the client side the events are user driven, on the server side the events are data driven.

### Why does Lightdash want to collect this data?

On the client side we want to know how the user behaves/interacts with our application.

Examples:

-   clicked nav button
-   clicked create dashboard button
-   opened settings modal
-   used run query key shortcut

Note: client side events aren't as reliable since users have multiple ways to prevent tracking.

On the server side we want to know what features are being used.

Examples:

-   created dashboard with 3 charts
-   updated saved chart with type BAR

## Client side (browser) tracking

In the frontend we have a React context/provider (`packages/frontend/src/providers/TrackingProvider.tsx`) that makes it
easy to track events from any component and all the types are in `packages/frontend/src/types/Events.ts`

### Event naming convention

Format: `<element name>.<action>`\
Example: `create_project_button.click`

### Tracking page/modal

When adding a new page to our routes make sure to wrap the page component with `<TrackPage/>`

Example:

```jsx
<Route path="/welcome">
    <TrackPage name={PageName.WELCOME}>
        <Welcome />
    </TrackPage>
</Route>
```

When adding a new modal page set the `type` and `category` properties.

Example:

```jsx
<TrackPage
    name={PageName.ORGANIZATION_SETTINGS}
    type={PageType.MODAL}
    category={CategoryName.SETTINGS}
>
    <OrganizationPanel />
</TrackPage>
```

### Tracking actions

When adding a button or interactive element/component we can record an event using the `track` method from `useTracking`
. These events usually don't have any extra information.

Example:

```js
const { track } = useTracking();
const onClick = useCallback(() => {
    // other click logic
    track({
        name: EventName.RUN_QUERY_BUTTON_CLICKED,
    });
}, [track]);
```

To provide more context to the events we can define significant sections of the application. This way we can distinguish
the same event in different sections of the page.

Example:

```jsx
<TrackSection name={SectionName.PAGE_FOOTER}>...</TrackSection>
```

## Server side tracking

In the backend package we have the class `LightdashAnalytics` to help us track events. Both the class and the types are
in `packages/backend/src/analytics/LightdashAnalytics.ts`.

### Event naming convention

Format: `<identity>.<action>`\
Example: `organization.created`

### Tracking

Tracking should be done at the service layer. It should avoid sensitive information like project details or query
results.

**What we shouldn't track:**

-   sensitive information like passwords/secrets/credentials
-   dbt modal/fields names
-   warehouse schema names
-   query sql

**What we can track instead:**

-   what warehouse are they using eg: bigquery, postgres, snowflake
-   how many modals does the dbt project have
-   how many filters are they using in their query

Example:

```js
analytics.track({
    event: 'project.created',
    userId: user.userUuid,
    projectId: projectUuid,
    organizationId: user.organizationUuid,
    properties: {
        projectId: projectUuid,
        projectType: data.dbtConnection.type,
        warehouseConnectionType: data.warehouseConnection.type,
    },
});
```
