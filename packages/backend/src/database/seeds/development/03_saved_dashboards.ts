import {
    DashboardChartTile,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTileTypes,
    SEED_PROJECT,
} from 'common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { getSpaceWithQueries } from '../../entities/spaces';

const markdownSample = `# h1 Heading
## h2 Heading
### h3 Heading
#### h4 Heading
##### h5 Heading
###### h6 Heading


## Horizontal Rules

___

---

***


## Emphasis

**This is bold text**

__This is bold text__

*This is italic text*

_This is italic text_

~~Strikethrough~~


## Blockquotes


> Blockquotes can also be nested...
>> ...by using additional greater-than signs right next to each other...
> > > ...or with spaces between arrows.


## Lists

Unordered

+ Create a list by starting a line with \`+\`, \`-\`, or \`*\`
+ Sub-lists are made by indenting 2 spaces:
  - Marker character change forces new list start:
    * Ac tristique libero volutpat at
    + Facilisis in pretium nisl aliquet
    - Nulla volutpat aliquam velit
+ Very easy!

Ordered

1. Lorem ipsum dolor sit amet
2. Consectetur adipiscing elit
3. Integer molestie lorem at massa


1. You can use sequential numbers...
1. ...or keep all the numbers as \`1.\`

Start numbering with offset:

57. foo
1. bar


## Code

Inline \`code\`

Indented code

    // Some comments
    line 1 of code
    line 2 of code
    line 3 of code


Block code "fences"

\`\`\`
Sample text here...
\`\`\`

Syntax highlighting

\`\`\` js
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
\`\`\`

## Tables

| Option | Description |
| ------ | ----------- |
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |`;

export async function seed(knex: Knex): Promise<void> {
    // delete existing dashboards
    await knex('dashboards').del();

    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const { queries, uuid: spaceUuid } = await getSpaceWithQueries(
        SEED_PROJECT.project_uuid,
    );

    const loomTile: DashboardLoomTile = {
        uuid: uuidv4(),
        x: 0,
        y: 0,
        w: 6,
        h: 3,
        type: DashboardTileTypes.LOOM,
        properties: {
            title: 'Tutorial: Creating your first metrics and dimensions',
            url: 'https://www.loom.com/share/6b8d3d5ccc644fa8bf68ffb754cbb783',
        },
    };

    const markdownTile: DashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 6,
        y: 0,
        w: 6,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        properties: {
            title: 'Markdown showcase',
            content: markdownSample,
        },
    };

    const chartTiles = queries.map<DashboardChartTile>(
        ({ uuid: savedChartUuid }, i) => ({
            uuid: uuidv4(),
            x: i % 2 === 0 ? 0 : 6,
            y: Math.floor(i / 2) * 3 + 3,
            w: i === 0 || i % 3 === 0 ? 12 : 6,
            h: 3,
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid },
        }),
    );

    await dashboardModel.create(spaceUuid, {
        name: 'Jaffle dashboard',
        tiles: [loomTile, markdownTile, ...chartTiles],
    });
}
