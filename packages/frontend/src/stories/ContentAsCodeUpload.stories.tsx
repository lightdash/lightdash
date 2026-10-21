import {
    ChartType,
    ContentAsCodeType,
    DashboardTileTypes,
    type ChartAsCode,
    type DashboardAsCode,
    type SpaceAsCode,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState, type ComponentProps } from 'react';
import ContentAsCodeUploadModal from '../features/contentAsCode/components/ContentAsCodeUploadModal';
import { type ImportEntry } from '../features/contentAsCode/importContent';

const space: SpaceAsCode = {
    contentType: ContentAsCodeType.SPACE,
    version: 1,
    spaceName: 'Sales',
    slug: 'sales',
};

const chart: ChartAsCode = {
    contentType: ContentAsCodeType.CHART,
    version: 1,
    name: 'Monthly revenue',
    description: 'Revenue by month',
    slug: 'monthly-revenue',
    spaceSlug: 'sales',
    tableName: 'orders',
    dashboardSlug: undefined,
    chartConfig: { type: ChartType.TABLE },
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_order_month'],
        metrics: ['orders_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
};

const dashboard: DashboardAsCode = {
    contentType: ContentAsCodeType.DASHBOARD,
    version: 1,
    name: 'Sales overview',
    description: '',
    slug: 'sales-overview',
    spaceSlug: 'sales',
    tabs: [],
    tiles: [
        {
            uuid: undefined,
            tileSlug: 'revenue',
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            w: 18,
            h: 6,
            properties: {
                chartSlug: 'monthly-revenue',
                chartName: 'Monthly revenue',
                title: '',
                hideTitle: false,
            },
        },
    ],
};

const readyEntries: ImportEntry[] = [
    {
        id: 'space',
        fileName: 'sales.space.yml',
        document: { type: 'space', content: space },
        status: 'ready',
        message: null,
        warnings: [],
    },
    {
        id: 'chart',
        fileName: 'monthly-revenue.yml',
        document: { type: 'chart', content: chart },
        status: 'ready',
        message: null,
        warnings: [],
    },
    {
        id: 'chart-2',
        fileName: 'orders-by-region.yml',
        document: {
            type: 'chart',
            content: {
                ...chart,
                slug: 'orders-by-region',
                name: 'Orders by region',
            },
        },
        status: 'ready',
        message: null,
        warnings: [],
    },
    {
        id: 'dashboard',
        fileName: 'sales-overview.yml',
        document: { type: 'dashboard', content: dashboard },
        status: 'ready',
        message: null,
        warnings: [],
    },
];

type PreviewProps = ComponentProps<typeof ContentAsCodeUploadModal> & {
    failOnce?: boolean;
};

const Preview = ({ failOnce = false, ...props }: PreviewProps) => {
    const [opened, setOpened] = useState(true);
    const [revision, setRevision] = useState(0);
    const failed = useRef(false);
    return (
        <>
            <Button
                variant="default"
                onClick={() => {
                    failed.current = false;
                    setRevision((value) => value + 1);
                    setOpened(true);
                }}
            >
                Open upload dialog
            </Button>
            <ContentAsCodeUploadModal
                {...props}
                key={revision}
                opened={opened}
                onClose={() => setOpened(false)}
                onUpload={async (document) => {
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 900);
                    });
                    if (
                        failOnce &&
                        !failed.current &&
                        document.type === 'chart'
                    ) {
                        failed.current = true;
                        throw new Error(
                            'The field “orders_total_revenue” could not be found. Check the chart configuration and try again.',
                        );
                    }
                    return {
                        message:
                            document.type === 'space'
                                ? 'Space created'
                                : 'Content updated',
                        warnings: [],
                    };
                }}
            />
        </>
    );
};

const meta: Meta<PreviewProps> = {
    title: 'Content as code/Upload',
    component: ContentAsCodeUploadModal,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Frontend prototype. Browse/drop reads and validates real files locally. Upload responses are simulated in Storybook; no server is changed. Files run sequentially: parent spaces, charts, dashboards. Successful files remain on retry.',
            },
        },
    },
    args: {
        opened: true,
        projectName: 'Jaffle Shop',
        onClose: () => {},
        onUpload: async () => ({ message: 'Updated', warnings: [] }),
    },
    render: (args) => <Preview {...args} />,
};

export default meta;
type Story = StoryObj<PreviewProps>;

export const Empty: Story = {};

export const ReadyToUpload: Story = { args: { initialEntries: readyEntries } };

export const ValidationErrors: Story = {
    args: {
        initialEntries: [
            ...readyEntries.slice(0, 2),
            {
                id: 'invalid',
                fileName: 'sales-overview.yml',
                document: null,
                status: 'invalid',
                message:
                    'File must have required property “tiles”.\nAdd the dashboard tiles array and re-add this file.',
                warnings: [],
            },
            {
                id: 'unsupported',
                fileName: 'agent.yml',
                document: null,
                status: 'invalid',
                message:
                    '“ai_agent” files are not supported yet. Add spaces, charts, or dashboards.',
                warnings: [],
            },
        ],
    },
};

export const DuplicateSlugs: Story = {
    args: {
        initialEntries: [
            ...readyEntries.slice(0, 2),
            {
                ...readyEntries[1],
                id: 'duplicate',
                fileName: 'monthly-revenue-copy.yaml',
            },
        ],
    },
};

export const PartialSuccess: Story = {
    args: {
        initialEntries: readyEntries.map((entry) =>
            entry.id === 'chart'
                ? {
                      ...entry,
                      status: 'error',
                      message:
                          'The field “orders_total_revenue” could not be found in the destination project.',
                  }
                : entry.id === 'dashboard'
                  ? {
                        ...entry,
                        status: 'blocked',
                        message:
                            'A chart used by this dashboard failed. Retry after the chart succeeds.',
                    }
                  : {
                        ...entry,
                        status: 'success',
                        message:
                            entry.id === 'space'
                                ? 'Space created'
                                : 'Chart updated',
                    },
        ),
    },
};

export const UploadWithFailure: Story = {
    args: { initialEntries: readyEntries, failOnce: true },
};

export const Complete: Story = {
    args: {
        initialEntries: readyEntries.map((entry) => ({
            ...entry,
            status: 'success',
            message: entry.id === 'space' ? 'Space created' : 'Content updated',
        })),
    },
};
