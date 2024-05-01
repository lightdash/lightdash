import SelectProject from './assets/promote-select-project.png';
import PromoteViewChart from './assets/promote-view-chart.png';
import PromoteListChart from './assets/promote-list-chart.png';
import SucessMessage from './assets/promote-success.png';

# How to promote content

Promoting content enables you to copy content from one project to another, this can also be used to replicate changes from one `development project` into a `production project`. This helps keep everything consistent and makes it easier to manage changes.

## How promoting works

If you are promoting a chart, from one `development project` to a `production project`, this will happen:

- If the chart exists in both the `development project` and the `production project`, the chart in the `production` will be updated with the changes from `development`. You can always revert this chart to a previous version using [version history](./version-history)
- If the chart is new, we will replicate this chart into the `production project`. We will also create a new space if needed.

## Configure upstream project

Before you can start promoting content, you need to configure your upstream project.
To do this, on your `development project` go to settings > Data ops

In there, select the project where you want to copy the content to.

<img
src={SelectProject}
width="668"
height="466"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

## Promote charts

You can promote charts from the `chart` in view mode or from any listing (like home page or all charts), click on the `...` button and then select `promote chart`

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

You must be a `developer` and have access to the chart/dashboard/space in both the `development project` and the `upstream project`

:::

Once the chart is promoted, you can click on the `success` banner to open a new tab into this chart in the `production project`

<img
src={SucessMessage}
width="455"
height="94"
style={{ display: 'block', margin: '0 auto 20px auto' }}
/>

## Promote dashboards and spaces

Soon.
