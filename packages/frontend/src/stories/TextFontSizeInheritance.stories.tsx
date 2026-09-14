import {
    Anchor,
    Badge,
    Box,
    Code,
    Group,
    Menu,
    Paper,
    Popover,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconFilter, IconHelpCircle } from '@tabler/icons-react';
import {
    useLayoutEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../components/common/MantineIcon';
import TruncatedText from '../components/common/TruncatedText';
import styles from './TextFontSizeInheritance.module.css';

/**
 * Mantine v8 gives Text/Anchor a `md` (16px) fallback font-size instead of
 * inheriting like v6 did. A rule in styles/global.css restores inheritance as
 * the fallback. These stories rebuild the production patterns that were
 * affected and assert the fix by measuring computed styles: the probed
 * element (dashed outline) must match its parent's font-size, or the
 * explicitly expected size.
 */

type Measurement = {
    actual: string;
    expected: string;
    pass: boolean;
};

const MeasuredExample: FC<{
    title: string;
    source: string;
    /** 'inherit' compares the probe to its parent; a number asserts px */
    expected: 'inherit' | number;
    children: ReactNode;
}> = ({ title, source, expected, children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [measurement, setMeasurement] = useState<Measurement | null>(null);

    useLayoutEffect(() => {
        const probe = ref.current?.querySelector(`.${styles.probe}`);
        if (!probe || !probe.parentElement) return;
        const actual = getComputedStyle(probe).fontSize;
        const expectedPx =
            expected === 'inherit'
                ? getComputedStyle(probe.parentElement).fontSize
                : `${expected}px`;
        setMeasurement({
            actual,
            expected: expectedPx,
            pass: actual === expectedPx,
        });
    }, [expected]);

    return (
        <Paper p="md">
            <Group justify="space-between" align="flex-start" mb="sm">
                <Box>
                    <Text fw={600}>{title}</Text>
                    <Text fz="xs" c="dimmed">
                        {source}
                    </Text>
                </Box>
                {measurement && (
                    <Badge
                        radius="xs"
                        color={measurement.pass ? 'green' : 'red'}
                    >
                        {measurement.pass
                            ? `${measurement.actual} ✓`
                            : `${measurement.actual} ✗ expected ${measurement.expected}`}
                    </Badge>
                )}
            </Group>
            <div ref={ref}>{children}</div>
        </Paper>
    );
};

const meta: Meta = {
    title: 'Regressions/Text font-size inheritance',
    parameters: {
        docs: {
            description: {
                component:
                    'Unsized Text/Anchor must inherit font-size (and line-height) from context instead of falling back to Mantine v8’s 16px `md`. Each example probes the dashed-outline element and compares its computed font-size to its parent. All badges must be green.',
            },
        },
    },
};

export default meta;
type Story = StoryObj;

export const NestedSpansInSizedText: Story = {
    render: () => (
        <Stack maw={560}>
            <MeasuredExample
                title="Bold span inside fz=xs help copy"
                source="AiAgentAdminReviewItemsTable.tsx — HoverCard concept help"
                expected={12}
            >
                <Text fz="xs" c="dimmed">
                    A{' '}
                    <Text span fw={600} c="ldGray.9" className={styles.probe}>
                        turn
                    </Text>{' '}
                    is one question and answer. When a turn shows a clear issue,
                    it becomes a finding.
                </Text>
            </MeasuredExample>
            <MeasuredExample
                title="Anchor inside fz=xs Text"
                source="SlackSettingsPanel/index.tsx — docs link"
                expected={12}
            >
                <Text c="dimmed" fz="xs">
                    Sharing in Slack allows you to unfurl Lightdash URLs.{' '}
                    <Anchor
                        href="https://docs.lightdash.com/references/slack-integration"
                        className={styles.probe}
                    >
                        View docs
                    </Anchor>
                </Text>
            </MeasuredExample>
            <MeasuredExample
                title="Value span inside dashboard filter pill"
                source="dashboardFilters/ActiveFilters/Filter.tsx"
                expected="inherit"
            >
                <Text fz="xs">
                    Order status{' '}
                    <Text span c="dimmed" className={styles.probe}>
                        is any of{' '}
                    </Text>
                    <Text fw={500} span>
                        completed, shipped
                    </Text>
                </Text>
            </MeasuredExample>
        </Stack>
    ),
};

export const MenuItemsAndTooltips: Story = {
    render: () => (
        <Stack maw={560}>
            <MeasuredExample
                title="Quick filter menu item label + value"
                source="Explorer/QuickFilterMenuItems.tsx"
                expected="inherit"
            >
                <Menu opened withinPortal={false} position="bottom-start">
                    <Menu.Target>
                        <span />
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                        >
                            <Group gap={4} wrap="nowrap">
                                <Text span className={styles.probe}>
                                    Filter by
                                </Text>
                                <TruncatedText
                                    inline
                                    fw="bold"
                                    fz="inherit"
                                    maxWidth={200}
                                >
                                    completed
                                </TruncatedText>
                            </Group>
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </MeasuredExample>
            <MeasuredExample
                title="Tooltip label with bold table names"
                source="dashboardFilters/ActiveFilters/Filter.tsx"
                expected={12}
            >
                <Tooltip
                    opened
                    withinPortal={false}
                    label={
                        <Text>
                            Tables:{' '}
                            <Text span fw={600} className={styles.probe}>
                                orders, customers
                            </Text>
                        </Text>
                    }
                >
                    <Text span>Order date</Text>
                </Tooltip>
            </MeasuredExample>
            <MeasuredExample
                title="Text inside a Badge"
                source="SlackSettingsPanel/index.tsx — workspace badge"
                expected="inherit"
            >
                <Badge radius="xs" size="lg" color="green">
                    <Text span fw={500} className={styles.probe}>
                        Lightdash HQ
                    </Text>
                </Badge>
            </MeasuredExample>
            <MeasuredExample
                title="Unsized Text in a dropdown inherits the body size"
                source="ee/aiCopilot — ReviewConceptHelp"
                expected={14}
            >
                <Popover opened withinPortal={false} position="bottom-start">
                    <Popover.Target>
                        <Box w="fit-content">
                            <MantineIcon icon={IconHelpCircle} />
                        </Box>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Text className={styles.probe}>
                            Unsized Text in a dropdown inherits the body size.
                        </Text>
                    </Popover.Dropdown>
                </Popover>
            </MeasuredExample>
        </Stack>
    ),
};

export const ExplicitSizesStillWin: Story = {
    render: () => (
        <Stack maw={560}>
            <MeasuredExample
                title="size prop wins over inheritance"
                source="size='lg' declares --text-fz, so the fallback never applies"
                expected={18}
            >
                <Text fz="xs">
                    Tiny context{' '}
                    <Text span size="lg" className={styles.probe}>
                        stays lg
                    </Text>
                </Text>
            </MeasuredExample>
            <MeasuredExample
                title="fz prop wins over inheritance"
                source="fz='sm' emits an inline font-size"
                expected={14}
            >
                <Text fz="xl">
                    Large context{' '}
                    <Text span fz="sm" className={styles.probe}>
                        stays sm
                    </Text>
                </Text>
            </MeasuredExample>
            <MeasuredExample
                title="TruncatedText keeps its own sm default"
                source="components/common/TruncatedText — deliberate fz='sm'"
                expected={14}
            >
                <Text fz="xs">
                    <TruncatedText
                        inline
                        maxWidth={280}
                        className={styles.probe}
                    >
                        Defaults to sm even in an xs context
                    </TruncatedText>
                </Text>
            </MeasuredExample>
            <MeasuredExample
                title="Top-level unsized Text inherits the 14px body size"
                source="styles/global.css sets body { font-size: 14px }"
                expected={14}
            >
                <Text className={styles.probe}>
                    Plain paragraph copy is 14px, not Mantine’s 16px{' '}
                    <Code>md</Code> fallback.
                </Text>
            </MeasuredExample>
        </Stack>
    ),
};
