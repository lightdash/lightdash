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
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    ChartTypeGallery,
    type ChartTypeGalleryItem,
    type ChartTypeGallerySection,
} from '../components/Explorer/ChartGallery/ChartTypeGallery';

const builtInDefinitions: [string, TablerIcon, boolean][] = [
    ['Bar chart', IconChartBar, false],
    ['Horizontal bar chart', IconChartBar, true],
    ['Line chart', IconChartLine, false],
    ['Area chart', IconChartArea, false],
    ['Scatter chart', IconChartDots, false],
    ['Pie chart', IconChartPie, false],
    ['Funnel chart', IconFilter, false],
    ['Treemap', IconChartTreemap, false],
    ['Gauge', IconGauge, false],
    ['Sankey', IconGitMerge, false],
    ['Map', IconMap, false],
    ['Table', IconTable, false],
    ['Big value', IconSquareNumber1, false],
    ['Vega (JSON editor)', IconCode, false],
];

const buildBuiltIns = (
    selectedKey: string | null,
    disabled: boolean,
    onSelect: (key: string) => void,
): ChartTypeGalleryItem[] =>
    builtInDefinitions.map(([label, icon, rotatedIcon]) => ({
        key: label,
        label,
        description: null,
        icon,
        rotatedIcon,
        selected: label === selectedKey,
        disabled,
        select: () => onSelect(label),
    }));

const projectDefinitions: [string, string][] = [
    ['Event pulse', 'Ranked bars with weekly event totals'],
    ['Retention curve', 'Cohort retention over the first 12 weeks'],
];

const buildProjectItems = (
    selectedKey: string | null,
    onSelect: (key: string) => void,
): ChartTypeGalleryItem[] =>
    projectDefinitions.map(([label, description]) => ({
        key: label,
        label,
        description,
        icon: IconPuzzle,
        rotatedIcon: false,
        selected: label === selectedKey,
        disabled: false,
        select: () => onSelect(label),
    }));

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
    const matches = (label: string) =>
        label.toLowerCase().includes(search.toLowerCase());

    const sections: ChartTypeGallerySection[] = [
        ...(showProjectSection
            ? [
                  {
                      label: 'Project',
                      layout: 'rows' as const,
                      items: buildProjectItems(
                          selectedKey,
                          setClickedKey,
                      ).filter((item) => matches(item.label)),
                      loading: false,
                      errorMessage: null,
                      emptyMessage: search
                          ? 'No project chart types match your search'
                          : 'No project chart types yet',
                      onRetry: null,
                      onLoadMore: null,
                      loadingMore: false,
                      onCreateNew: () => {},
                  },
              ]
            : []),
        {
            label: 'Built in',
            layout: builtInLayout,
            items: buildBuiltIns(selectedKey, disabled, setClickedKey).filter(
                (item) => matches(item.label),
            ),
            loading: false,
            errorMessage: null,
            emptyMessage: 'No built-in chart types match your search',
            onRetry: null,
            onLoadMore: null,
            loadingMore: false,
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
            options: [null, ...builtInDefinitions.map(([label]) => label)],
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
