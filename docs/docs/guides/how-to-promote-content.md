import SelectProject from './assets/promote-select-project.png';
import PromoteViewChart from './assets/promote-view-chart.png';
import PromoteListChart from './assets/promote-list-chart.png';
import SucessMessage from './assets/promote-success.png';
import PromoteViewDashboard from './assets/promote-view-dashboard.png';
import PromoteListDashboard from './assets/promote-list-dashboard.png';
import SucessDashboardMessage from './assets/promote-dashboard-success.png';

# How to promote content

Promoting content enables you to copy content from one project to another. It's especially useful when working with preview or development projects. You can promote charts created in your development projects to production, so it's easy to test and make changes without the fear of breaking things in production.

## How promoting works

If you are promoting a chart, from a `development` project to a `production` project, this will happen:

- If the chart exists (with the same name) in both the `development` project and the `production` project, the chart in `production` will be updated with the changes from `development`. You can always revert this chart to a previous version using [version history](./version-history)
- If the chart is new, we will replicate the `development` chart into the `production` project. We will also create a new space if a space does not exist with the same name.

## Configure upstream project

Before you can start promoting content, you need to configure your upstream project.
To do this, on your `development` project go to settings > Data ops.

Select the project where you want to copy the content to.

<img
src={SelectProject}
width="668"
height="466"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

## Promote charts

You can promote charts from the `chart` in view mode or from any listing (like home page or all charts), click on the `...` button and then select `promote chart`.

<img
src={PromoteViewChart}
width="160"
height="200"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

<img
src={PromoteListChart}
width="668"
height="466"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

:::info

You must be a `developer` and have access to the chart and space in both the `development project` and the `upstream project`. The space must also be public—promoting content in private or restricted access spaces is not supported yet.

:::

Once the chart is promoted, you can click on the `success` banner to open a new tab into this chart in the `production project`

<img
src={SucessMessage}
width="455"
height="94"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

## Promote dashboards

You can promote dashboards from the `dashboard` in view mode or from any listing (like home page or all dashboards), click on the `...` button and then select `promote dashboard`.

This will promote the dashboard to the `upstream` project as well as all the charts in this dashboard (for both charts within spaces and charts within this dashboard) and all other non-chart tiles like markdown.

If the dashboard or charts are in a space that doesn't exist in the upstream project, then these spaces will be created and the content will be put in these spaces.

<img
src={PromoteViewDashboard}
width="160"
height="200"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

<img
src={PromoteListDashboard}
width="668"
height="466"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

:::info

You must be a `developer` and have access to the dashboard and space in both the `development project` and the `upstream project` as well as have access to all the charts in the dashboard. The space must also be public—promoting content in private or restricted access spaces is not supported yet.

:::

Once the dashboard is promoted, you can click on the `success` banner to open a new tab into this dashboard in the `production project`.

<img
src={SucessDashboardMessage}
width="455"
height="94"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>
