import {
    Accordion,
    Badge,
    Checkbox,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC, ReactNode } from 'react';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import contentTableClasses from '../../components/common/ContentTable/ContentTable.module.css';
import PromptComposer from '../../components/common/PromptComposer/PromptComposer';
import sortButtonClasses from '../../components/SortButton/SortButton.module.css';
import accordionClasses from '../../components/VisualizationConfigs/common/Accordion.module.css';
import { AccordionControl } from '../../components/VisualizationConfigs/common/AccordionControl';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon/AiAgentIcon';
import { FormulaReferencePanel } from '../../features/tableCalculation/components/FormulaForm/FormulaReference';

/**
 * Feature components whose CSS modules reach into Mantine's generated class
 * names through :global(.mantine-*). Those selectors are not covered by the
 * Styles API contract, so they are the first thing to break when Mantine
 * renames an internal part. Each story renders the owning component with the
 * selector-dependent state visible.
 */
const meta: Meta = {
    title: 'Mantine baseline/Feature selectors',
    parameters: { layout: 'padded' },
};

export default meta;

const Section: FC<{ title: string; hint: string; children: ReactNode }> = ({
    title,
    hint,
    children,
}) => (
    <Stack gap="xs">
        <Title order={5}>{title}</Title>
        <Text size="xs" c="dimmed">
            {hint}
        </Text>
        {children}
    </Stack>
);

const SQL = `SELECT
    order_date,
    customer_id,
    SUM(order_total) AS total
FROM analytics.orders
WHERE order_date >= '2026-01-01'
GROUP BY 1, 2
ORDER BY total DESC
LIMIT 500`;

export const CodeHighlight: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section
                title="CodeBlock with line numbers"
                hint="CodeBlock.module.css: .wrapper[data-with-line-numbers] :global(.mantine-CodeHighlight-code)"
            >
                <CodeBlock code={SQL} language="sql" withLineNumbers />
            </Section>
            <Section
                title="CodeBlock without line numbers"
                hint="Same component, copy control from @mantine/code-highlight"
            >
                <CodeBlock code={SQL} language="sql" />
            </Section>
        </Stack>
    ),
};

export const RichTextEditor: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section
                title="PromptComposer card, sizes lg / md / sm"
                hint="PromptComposer.module.css: :global(.mantine-RichTextEditor-content)"
            >
                <PromptComposer
                    size="lg"
                    placeholder="Ask anything about your data"
                    defaultValue="Large composer with a default value"
                />
                <PromptComposer size="md" placeholder="Medium composer" />
                <PromptComposer size="sm" placeholder="Small composer" />
            </Section>
            <Section
                title="PromptComposer inline and accent"
                hint="Inline variant is used inside cards; indigo accent marks deep research"
            >
                <Paper p="sm">
                    <PromptComposer variant="inline" placeholder="Inline" />
                </Paper>
                <PromptComposer
                    accent="indigo"
                    size="md"
                    placeholder="Indigo accent"
                />
                <PromptComposer size="md" disabled defaultValue="Disabled" />
            </Section>
        </Stack>
    ),
};

export const VisualizationConfigAccordion: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={420}>
            <Section
                title="Conditional formatting list"
                hint="VisualizationConfigs/common/Accordion.module.css: :global(.mantine-Accordion-control | -label | -panel)"
            >
                <Accordion
                    multiple
                    variant="contained"
                    defaultValue={['rule-1']}
                    className={accordionClasses.containedList}
                    transparentActiveItem
                >
                    <Accordion.Item value="rule-1">
                        <AccordionControl
                            label="Rule 1"
                            description="Revenue greater than 1,000"
                            onRemove={() => {}}
                        />
                        <Accordion.Panel>
                            <Text size="xs" p="sm">
                                Open panel content
                            </Text>
                        </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item value="rule-2">
                        <AccordionControl
                            label="Rule 2"
                            description="Status is cancelled"
                            onRemove={() => {}}
                        />
                        <Accordion.Panel>
                            <Text size="xs" p="sm">
                                Hidden
                            </Text>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Section>
        </Stack>
    ),
};

export const BadgesAndCheckboxes: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={520}>
            <Section
                title="SortButton badge truncation"
                hint="SortButton.module.css: .badge :global(.mantine-Badge-label) gets ellipsis"
            >
                <Group maw={180}>
                    <Badge color="blue" className={sortButtonClasses.badge}>
                        <Group
                            className={sortButtonClasses.content}
                            gap={2}
                            wrap="nowrap"
                        >
                            <Text span fw={400} fz="xs">
                                Sorted by
                            </Text>
                            <Text
                                className={sortButtonClasses.field}
                                fw={600}
                                fz="xs"
                            >
                                A very long field label that must truncate
                            </Text>
                        </Group>
                    </Badge>
                </Group>
            </Section>
            <Section
                title="ContentTable row-select cell"
                hint="ContentTable.module.css: .rowSelectCell :global(.mantine-Checkbox-root | -body | -inner) centred"
            >
                <Paper p={0} maw={120}>
                    <div className={contentTableClasses.rowSelectCell}>
                        <Checkbox size="xs" defaultChecked />
                    </div>
                    <div className={contentTableClasses.rowSelectCell}>
                        <Checkbox size="xs" indeterminate />
                    </div>
                </Paper>
            </Section>
        </Stack>
    ),
};

export const AgentIconHover: StoryObj = {
    render: () => (
        <Section
            title="AiAgentIcon inside a Group"
            hint="AiAgentIcon.module.css: :global(.mantine-Group-root:hover) .root animates. Hover the row."
        >
            <Group gap="md" p="sm" style={{ width: 'fit-content' }}>
                <AiAgentIcon size={20} />
                <AiAgentIcon size={20} muted />
                <AiAgentIcon size={20} animated />
                <AiAgentIcon size={20} calm />
                <Text size="sm">Hover this group</Text>
            </Group>
        </Section>
    ),
};

export const FormulaReference: StoryObj = {
    render: () => (
        <Section
            title="Formula reference panel"
            hint="FormulaReference.module.css: .helperButton :global(.mantine-Button-section)"
        >
            <Paper maw={360} h={480} style={{ overflow: 'hidden' }}>
                <FormulaReferencePanel
                    opened
                    onToggle={() => {}}
                    onInsert={() => {}}
                />
            </Paper>
        </Section>
    ),
};
