import { Alert, Stack, Text, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconCircleCheck,
    IconInfoCircle,
} from '@tabler/icons-react';
import Callout from '../components/common/Callout';
import MantineIcon from '../components/common/MantineIcon';

const meta: Meta<typeof Alert> = {
    title: 'Components/Alert',
    component: Alert,
    tags: ['autodocs'],
    argTypes: {
        color: {
            control: 'select',
            options: ['gray', 'green', 'orange', 'red', 'blue', 'yellow'],
        },
        variant: {
            control: 'select',
            options: ['light', 'filled', 'outline', 'default'],
        },
        withCloseButton: { control: 'boolean' },
    },
    decorators: [
        (Story) => (
            <Stack maw={560} p="lg">
                <Story />
            </Stack>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Playground: Story = {
    args: {
        color: 'green',
        title: 'Deploy succeeded',
        children: 'Your changes are live on production.',
        icon: <MantineIcon icon={IconCircleCheck} />,
        withCloseButton: false,
    },
};

/** The four semantic tones with a title, as rendered by the raw Alert. */
export const SemanticWithTitles: Story = {
    render: () => (
        <>
            <Alert
                color="gray"
                title="Heads up"
                icon={<MantineIcon icon={IconInfoCircle} />}
            >
                A calm, monochrome alert that never shouts.
            </Alert>
            <Alert
                color="green"
                title="Deploy succeeded"
                icon={<MantineIcon icon={IconCircleCheck} />}
            >
                Your changes are live on production.
            </Alert>
            <Alert
                color="orange"
                title="Approaching limit"
                icon={<MantineIcon icon={IconAlertTriangle} />}
            >
                You have used 82% of your monthly quota.
            </Alert>
            <Alert
                color="red"
                title="Payment failed"
                icon={<MantineIcon icon={IconAlertCircle} />}
            >
                We could not charge the card on file.
            </Alert>
        </>
    ),
};

/** The same tones through the shared `Callout` wrapper, which picks the icon. */
export const CalloutVariants: Story = {
    render: () => (
        <>
            <Callout variant="neutral" title="Heads up">
                A calm, monochrome alert that never shouts.
            </Callout>
            <Callout variant="info" title="Did you know?">
                Links are the only blue text, so info stays close to neutral.
            </Callout>
            <Callout variant="success" title="Deploy succeeded">
                Your changes are live on production.
            </Callout>
            <Callout variant="warning" title="Approaching limit">
                You have used 82% of your monthly quota.
            </Callout>
            <Callout variant="danger" title="Payment failed">
                We could not charge the card on file.
            </Callout>
        </>
    ),
};

/** Without a title the body carries the message, still in the quiet tone. */
export const MessageOnly: Story = {
    render: () => (
        <>
            <Alert color="gray" icon={<MantineIcon icon={IconInfoCircle} />}>
                Scheduled deliveries pause while the project is being refreshed.
            </Alert>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconAlertTriangle} />}
            >
                This explore has unsaved changes.
            </Alert>
            <Alert color="red" icon={<MantineIcon icon={IconAlertCircle} />}>
                The warehouse connection timed out.
            </Alert>
            <Alert color="green">No icon, no title, just a confirmation.</Alert>
        </>
    ),
};

export const WithCloseButton: Story = {
    render: () => (
        <>
            <Alert
                color="orange"
                title="Approaching limit"
                icon={<MantineIcon icon={IconAlertTriangle} />}
                withCloseButton
            >
                You have used 82% of your monthly quota.
            </Alert>
            <Alert color="red" withCloseButton>
                We could not charge the card on file.
            </Alert>
        </>
    ),
};

/** Longer bodies with rich content keep the semantic ink on the title only. */
export const RichContent: Story = {
    render: () => (
        <Alert
            color="red"
            title="Compilation failed"
            icon={<MantineIcon icon={IconAlertCircle} />}
        >
            <Stack gap="xs">
                <Text fz="sm">
                    Two models reference a column that no longer exists in the
                    warehouse.
                </Text>
                <Text fz="sm" ff="monospace">
                    orders.customer_segment, payments.channel
                </Text>
            </Stack>
        </Alert>
    ),
};

/** `filled` and `outline` are further steps of the same scale; `default` is
 *  Mantine's own. */
export const OtherVariants: Story = {
    render: () => (
        <>
            <Title order={6}>filled</Title>
            <Alert
                variant="filled"
                color="gray"
                title="Heads up"
                icon={<MantineIcon icon={IconInfoCircle} />}
            >
                A calm, monochrome alert that never shouts.
            </Alert>
            <Alert
                variant="filled"
                color="green"
                title="Deploy succeeded"
                icon={<MantineIcon icon={IconCircleCheck} />}
            >
                Your changes are live on production.
            </Alert>
            <Alert
                variant="filled"
                color="orange"
                title="Approaching limit"
                icon={<MantineIcon icon={IconAlertTriangle} />}
            >
                You have used 82% of your monthly quota.
            </Alert>
            <Alert
                variant="filled"
                color="red"
                title="Payment failed"
                icon={<MantineIcon icon={IconAlertCircle} />}
            >
                We could not charge the card on file.
            </Alert>
            <Title order={6}>outline</Title>
            <Alert
                variant="outline"
                color="gray"
                title="Heads up"
                icon={<MantineIcon icon={IconInfoCircle} />}
            >
                A calm, monochrome alert that never shouts.
            </Alert>
            <Alert
                variant="outline"
                color="green"
                title="Deploy succeeded"
                icon={<MantineIcon icon={IconCircleCheck} />}
            >
                Your changes are live on production.
            </Alert>
            <Alert
                variant="outline"
                color="red"
                title="Payment failed"
                icon={<MantineIcon icon={IconAlertCircle} />}
            >
                We could not charge the card on file.
            </Alert>
            <Title order={6}>default</Title>
            <Alert variant="default" title="Heads up">
                A bordered surface with no fill.
            </Alert>
        </>
    ),
};
