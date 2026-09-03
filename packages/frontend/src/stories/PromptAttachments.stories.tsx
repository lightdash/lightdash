import { ExternalSourceType } from '@lightdash/common';
import { Paper, Stack } from '@mantine/core';
import '@mantine/core/styles.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import {
    PromptAttachments,
    type ExternalSourceAttachment,
} from '../ee/features/aiCopilot/components/ChatElements/PromptAttachments';
import {
    elementRefKey,
    type ElementRef,
} from '../features/apps/utils/elementRefs';
import MantineBaseProvider from '../providers/MantineBaseProvider';

const singleTableCsv: ExternalSourceAttachment = {
    type: 'external_source',
    sourceUuid: 'src-1',
    displayName: 'orders.csv',
    sourceType: ExternalSourceType.CSV,
    tables: [{ tableUuid: 't-1', tableName: 'orders', displayName: 'Orders' }],
};

const multiTableCsv: ExternalSourceAttachment = {
    type: 'external_source',
    sourceUuid: 'src-2',
    displayName: 'finance-export.xlsx',
    sourceType: ExternalSourceType.CSV,
    tables: [
        { tableUuid: 't-2', tableName: 'revenue', displayName: 'Revenue' },
        { tableUuid: 't-3', tableName: 'costs', displayName: 'Costs' },
        { tableUuid: 't-4', tableName: 'headcount', displayName: 'Headcount' },
    ],
};

const heading: ElementRef = {
    tag: 'h1',
    text: 'Revenue by region',
    loc: 'src/App.jsx:14',
};
const buttonWithoutLoc: ElementRef = { tag: 'button', text: 'Send', loc: '' };
const longText: ElementRef = {
    tag: 'p',
    text: 'Weekly revenue over the last twenty-six weeks, split by re…',
    loc: 'src/pages/Overview/RevenueTrend.tsx:128',
};
const bareTag: ElementRef = { tag: 'svg', text: '', loc: 'src/Chart.tsx:9' };

type Args = ComponentProps<typeof PromptAttachments>;

/** Owns removal so pills disappear when clicked; the actions log each removal. */
const Scenario = (args: Args) => {
    const [externalSources, setExternalSources] = useState(
        args.externalSources,
    );
    const [elementRefs, setElementRefs] = useState(args.elementRefs);
    return (
        <PromptAttachments
            {...args}
            externalSources={externalSources}
            onRemoveExternalSource={(sourceUuid) => {
                args.onRemoveExternalSource(sourceUuid);
                setExternalSources((prev) =>
                    prev.filter((s) => s.sourceUuid !== sourceUuid),
                );
            }}
            elementRefs={elementRefs}
            onRemoveElementRef={(ref) => {
                args.onRemoveElementRef(ref);
                setElementRefs((prev) =>
                    prev.filter((r) => elementRefKey(r) !== elementRefKey(ref)),
                );
            }}
        />
    );
};

const meta: Meta<typeof Scenario> = {
    title: 'AI Copilot/Prompt Attachments',
    component: Scenario,
    args: {
        externalSources: [],
        pendingCsvFiles: [],
        elementRefs: [],
        onRemoveExternalSource: fn(),
        onRemoveElementRef: fn(),
    },
    decorators: [
        (renderStory) => (
            <MantineBaseProvider>
                <Stack w={560} p="md">
                    <Paper p="sm">{renderStory()}</Paper>
                </Stack>
            </MantineBaseProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof Scenario>;

export const CsvSingleTable: Story = {
    args: { externalSources: [singleTableCsv] },
};

export const CsvMultiTable: Story = {
    args: { externalSources: [multiTableCsv] },
};

export const CsvPending: Story = {
    args: {
        externalSources: [singleTableCsv],
        pendingCsvFiles: [
            { id: 1, filename: 'customers.csv', status: 'preparing' },
            { id: 2, filename: 'products.csv', status: 'queued' },
        ],
    },
};

export const ElementReferences: Story = {
    args: { elementRefs: [heading, buttonWithoutLoc, bareTag] },
};

export const ElementReferenceLongText: Story = {
    args: { elementRefs: [longText] },
};

export const Mixed: Story = {
    args: {
        externalSources: [singleTableCsv, multiTableCsv],
        pendingCsvFiles: [
            { id: 1, filename: 'customers.csv', status: 'preparing' },
        ],
        elementRefs: [heading, buttonWithoutLoc, longText],
    },
};
