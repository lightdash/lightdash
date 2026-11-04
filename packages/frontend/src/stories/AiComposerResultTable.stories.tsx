import {
    DimensionType,
    type ResultColumn,
    type ResultRow,
} from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { clsx } from 'clsx';
import panelStyles from '../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { getAiArtifactTableConfig } from '../ee/features/aiCopilot/components/ChatElements/AiArtifactTableVisualization.utils';
import { AiComposerArtifactVisualization } from '../ee/features/aiCopilot/components/ChatElements/AiComposerArtifactVisualization';
import ChartColorMappingContextProvider from '../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../hooks/useQueryResults';
import { STORY_PROJECT_UUID } from './fixtures/semanticQueryStoryData';
import SemanticQueryStoryProviders from './fixtures/SemanticQueryStoryProviders';

type Cell = { raw: string | number; formatted: string };

const toResults = (
    columns: ResultColumn[],
    rows: Cell[][],
): InfiniteQueryResults => ({
    queryUuid: 'story-query',
    totalResults: rows.length,
    columns: Object.fromEntries(columns.map((c) => [c.reference, c])),
    rows: rows.map(
        (row): ResultRow =>
            Object.fromEntries(
                row.map((cell, index) => [
                    columns[index].reference,
                    { value: cell },
                ]),
            ),
    ),
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: () => {},
    refetchRows: async () => {},
    setFetchAll: () => {},
    fetchAll: true,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
});

const num = (raw: number, formatted = String(raw)): Cell => ({
    raw,
    formatted,
});
const str = (raw: string): Cell => ({ raw, formatted: raw });

/** The semantic-layer node at the start of the pipeline. */
const nodeResults = toResults(
    [
        { reference: 'orders_status', type: DimensionType.STRING },
        {
            reference: 'orders_unique_order_count',
            type: DimensionType.NUMBER,
        },
    ],
    [
        [str('completed'), num(97)],
        [str('shipped'), num(26)],
        [str('placed'), num(22)],
        [str('returned'), num(4)],
        [str('return_pending'), num(2)],
    ],
);

/** The duckdb node the pipeline ends in. */
const finalResults = toResults(
    [
        { reference: 'status', type: DimensionType.STRING },
        { reference: 'order_count', type: DimensionType.NUMBER },
        {
            reference: 'avg_amount',
            type: DimensionType.NUMBER,
            format: '$#,##0.00',
        },
        { reference: 'attainment_pct', type: DimensionType.NUMBER },
    ],
    [
        [str('completed'), num(97), num(25.5, '$25.50'), num(97)],
        [str('shipped'), num(26), num(29.64, '$29.64'), num(86.7)],
        [str('placed'), num(22), num(40.44, '$40.44'), num(110)],
        [str('returned'), num(4), num(13.5, '$13.50'), num(80)],
        [str('return_pending'), num(2), num(19, '$19.00'), num(100)],
    ],
);

const Head = ({ title }: { title: string }) => (
    <Box className={clsx(panelStyles.head, panelStyles.flushHead)}>
        <Stack gap={0} flex={1} miw={0}>
            <Text fz="sm" fw={600}>
                {title}
            </Text>
        </Stack>
    </Box>
);

const PanelFrame = ({ children }: { children: React.ReactNode }) => (
    <Box w={760} h={420}>
        <Box className={panelStyles.floatingPanel}>
            <Box
                className={clsx(
                    panelStyles.floatingContent,
                    panelStyles.flushContent,
                )}
            >
                {children}
            </Box>
        </Box>
    </Box>
);

type Props = { node: 'final' | 'upstream' };

/** The artifact panel's table for the final node and for an upstream node. */
const ComposerResultTable = ({ node }: Props) => {
    const results = node === 'final' ? finalResults : nodeResults;
    return (
        <PanelFrame>
            <AiComposerArtifactVisualization
                projectUuid={STORY_PROJECT_UUID}
                results={results}
                queryUuid="story-query"
                runError={null}
                onRerun={() => {}}
                vizConfig={getAiArtifactTableConfig(
                    Object.values(results.columns ?? {}),
                )}
                headerContent={
                    <Head
                        title={
                            node === 'final'
                                ? 'Actuals vs target'
                                : 'Orders by status'
                        }
                    />
                }
            />
        </PanelFrame>
    );
};

const meta = {
    component: ComposerResultTable,
    title: 'AI Agent/Composer result table',
    decorators: [
        (Story) => (
            <SemanticQueryStoryProviders>
                <ChartColorMappingContextProvider>
                    <Story />
                </ChartColorMappingContextProvider>
            </SemanticQueryStoryProviders>
        ),
    ],
} satisfies Meta<typeof ComposerResultTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FinalNode: Story = { args: { node: 'final' } };

export const UpstreamNode: Story = { args: { node: 'upstream' } };
