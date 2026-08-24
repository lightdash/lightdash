import { Paper } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChartArea,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconCode,
    IconFilter,
    IconGauge,
    IconGitMerge,
    IconMap,
    IconPuzzle,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    ChartTypeGallery,
    type ChartTypeGalleryRowItem,
    type ChartTypeGallerySection,
} from '../components/Explorer/ChartGallery/ChartTypeGallery';

type GalleryItemDef = Pick<
    ChartTypeGalleryRowItem,
    'label' | 'description' | 'icon' | 'rotatedIcon'
>;

const builtInDefinitions: GalleryItemDef[] = [
    {
        label: 'Bar chart',
        description: 'Compare categories',
        icon: IconChartBar,
        rotatedIcon: false,
    },
    {
        label: 'Horizontal bar chart',
        description: 'Compare ranked categories',
        icon: IconChartBar,
        rotatedIcon: true,
    },
    {
        label: 'Line chart',
        description: 'Show a trend',
        icon: IconChartLine,
        rotatedIcon: false,
    },
    {
        label: 'Area chart',
        description: 'Compare magnitude over time',
        icon: IconChartArea,
        rotatedIcon: false,
    },
    {
        label: 'Scatter chart',
        description: 'Find relationships and outliers',
        icon: IconChartDots,
        rotatedIcon: false,
    },
    {
        label: 'Pie chart',
        description: 'Show part-to-whole',
        icon: IconChartPie,
        rotatedIcon: false,
    },
    {
        label: 'Funnel chart',
        description: 'Show stage conversion',
        icon: IconFilter,
        rotatedIcon: false,
    },
    {
        label: 'Treemap',
        description: 'Show hierarchical proportions',
        icon: IconChartTreemap,
        rotatedIcon: false,
    },
    {
        label: 'Gauge',
        description: 'Track progress toward a target',
        icon: IconGauge,
        rotatedIcon: false,
    },
    {
        label: 'Sankey',
        description: 'Show flow between categories',
        icon: IconGitMerge,
        rotatedIcon: false,
    },
    {
        label: 'Map',
        description: 'Plot geographic values',
        icon: IconMap,
        rotatedIcon: false,
    },
    {
        label: 'Table',
        description: 'Show every result row',
        icon: IconTable,
        rotatedIcon: false,
    },
    {
        label: 'Big value',
        description: 'Highlight a single metric',
        icon: IconSquareNumber1,
        rotatedIcon: false,
    },
    {
        label: 'Vega (JSON editor)',
        description: 'Write Vega-Lite JSON by hand',
        icon: IconCode,
        rotatedIcon: false,
    },
];

const projectDefinitions: GalleryItemDef[] = [
    {
        label: 'Event pulse',
        description: 'Ranked bars with weekly event totals',
        icon: IconPuzzle,
        rotatedIcon: false,
    },
    {
        label: 'Retention curve',
        description: 'Cohort retention over the first 12 weeks',
        icon: IconPuzzle,
        rotatedIcon: false,
    },
];

type BuildItemsArgs = {
    selectedKey: string | null;
    disabled: boolean;
    onSelect: (key: string) => void;
};

const buildItems = (
    defs: GalleryItemDef[],
    { selectedKey, disabled, onSelect }: BuildItemsArgs,
): ChartTypeGalleryRowItem[] =>
    defs.map((def) => ({
        ...def,
        key: def.label,
        selected: def.label === selectedKey,
        disabled,
        select: () => onSelect(def.label),
    }));

const rowsListStates = {
    loading: false,
    errorMessage: null,
    onRetry: null,
    onLoadMore: null,
    loadingMore: false,
};

type PlaygroundProps = {
    width: number;
    builtInLayout: 'grid' | 'rows';
    selectedLabel: string | null;
    disabled: boolean;
    showProjectSection: boolean;
    initialSearch: string;
};

/** Interactive stand-in for the Explorer container: real search filtering over mock data. */
const GalleryPlayground: FC<PlaygroundProps> = ({
    width,
    builtInLayout,
    selectedLabel,
    disabled,
    showProjectSection,
    initialSearch,
}) => {
    const [search, setSearch] = useState(initialSearch);
    // Clicking selects, like the real gallery; the arg is only the initial state.
    const [clickedKey, setClickedKey] = useState<string | null>(null);
    const selectedKey = clickedKey ?? selectedLabel;
    const matches = (item: ChartTypeGalleryRowItem) =>
        item.label.toLowerCase().includes(search.toLowerCase());

    const builtInItems = buildItems(builtInDefinitions, {
        selectedKey,
        disabled,
        onSelect: setClickedKey,
    }).filter(matches);
    const builtInEmptyMessage = 'No built-in chart types match your search';

    const sections: ChartTypeGallerySection[] = [
        ...(showProjectSection
            ? [
                  {
                      label: 'Project',
                      layout: 'rows' as const,
                      items: buildItems(projectDefinitions, {
                          selectedKey,
                          disabled: false,
                          onSelect: setClickedKey,
                      }).filter(matches),
                      emptyMessage: search
                          ? 'No project chart types match your search'
                          : 'No project chart types yet',
                      ...rowsListStates,
                      onCreateNew: () => {},
                  },
              ]
            : []),
        builtInLayout === 'grid'
            ? {
                  label: 'Built in',
                  layout: 'grid' as const,
                  items: builtInItems,
                  emptyMessage: builtInEmptyMessage,
              }
            : {
                  label: 'Built in',
                  layout: 'rows' as const,
                  items: builtInItems,
                  emptyMessage: builtInEmptyMessage,
                  ...rowsListStates,
                  onCreateNew: null,
              },
    ];

    return (
        <Paper w={width} h={640} withBorder p="md">
            <ChartTypeGallery
                search={search}
                onSearchChange={setSearch}
                sections={sections}
            />
        </Paper>
    );
};

const meta: Meta<typeof GalleryPlayground> = {
    title: 'Explorer/ChartTypeGallery',
    component: GalleryPlayground,
    argTypes: {
        width: { control: { type: 'range', min: 240, max: 560, step: 10 } },
        builtInLayout: { control: 'radio', options: ['grid', 'rows'] },
        selectedLabel: {
            control: 'select',
            options: [null, ...builtInDefinitions.map((def) => def.label)],
        },
    },
    args: {
        width: 400,
        builtInLayout: 'grid',
        selectedLabel: 'Bar chart',
        disabled: false,
        showProjectSection: true,
        initialSearch: '',
    },
};

export default meta;
type Story = StoryObj<typeof GalleryPlayground>;

/** The proposed design: built-ins as a card grid, project types as rows. */
export const BuiltInGrid: Story = {};

/** The current design on main, for comparison. */
export const LegacyRows: Story = {
    args: { builtInLayout: 'rows' },
};

/** Grid at the panel's minimum-ish width; auto-fill drops the column count. */
export const NarrowPanel: Story = {
    args: { width: 280 },
};

/** No query results yet: every chart type is disabled. */
export const DisabledState: Story = {
    args: { disabled: true, selectedLabel: null },
};

/** Search that matches nothing shows both empty messages. */
export const EmptySearch: Story = {
    args: { initialSearch: 'zzz' },
};

/** Built-ins only, as seen without the data apps feature flag. */
export const WithoutProjectSection: Story = {
    args: { showProjectSection: false },
};
