import type { Meta, StoryObj } from '@storybook/react';

import {
    Button,
    Group,
    List,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconFolderShare,
    IconLayoutDashboard,
    IconList,
    IconPlus,
    IconSend,
    IconSettings,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import Callout from '../components/common/Callout';

const meta: Meta<typeof MantineModal> = {
    component: MantineModal,
    title: 'Components/MantineModal',
    parameters: {
        docs: {
            description: {
                component:
                    'A reusable modal component with consistent styling, automatic Cancel button, and support for left/right actions.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof MantineModal>;

/**
 * Simple confirmation modal using the `description` prop.
 * This is the cleanest pattern for simple yes/no dialogs.
 */
export const SimpleConfirmation: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Delete Agent',
        icon: IconTrash,
        description:
            'Are you sure you want to delete this agent? This action cannot be undone.',
        actions: <Button color="red">Delete</Button>,
    },
};

/**
 * Delete confirmation with additional warning content.
 * Uses both `description` and `children` for complex content.
 */
export const DeleteWithWarning: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Delete Space',
        icon: IconTrash,
        description: 'Are you sure you want to delete space "Jaffle Shop"?',
        children: (
            <Callout
                variant="danger"
                title="This will permanently delete:"
            >
                <List size="sm">
                    <List.Item>12 charts</List.Item>
                    <List.Item>3 dashboards</List.Item>
                    <List.Item>
                        5 nested spaces (and all their contents)
                    </List.Item>
                </List>
            </Callout>
        ),
        actions: <Button color="red">Delete Space</Button>,
    },
};

/**
 * Modal with left-side actions (e.g., "New Space" button).
 * Uses the `leftActions` prop to position secondary actions on the left.
 */
export const WithLeftActions: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Move Items',
        icon: IconFolderShare,
        description: 'Select a space to move your items to.',
        leftActions: (
            <Button
                variant="subtle"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
            >
                New Space
            </Button>
        ),
        actions: <Button>Confirm</Button>,
    },
};

/**
 * Modal without Cancel button.
 * Set `cancelLabel={false}` to hide the auto-generated Cancel button.
 * The user can only close via the X button or by completing the action.
 */
export const NoCancelButton: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Send Now',
        icon: IconSend,
        description:
            'This will trigger the scheduled delivery immediately. It will not change or affect the configured schedule.',
        cancelLabel: false,
        actions: <Button>Send now</Button>,
    },
};

/**
 * Modal with custom Cancel label.
 * Change the Cancel button text using `cancelLabel`.
 */
export const CustomCancelLabel: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Unsaved Changes',
        icon: IconSettings,
        description:
            'You have unsaved changes. Are you sure you want to leave?',
        cancelLabel: 'Stay',
        actions: <Button color="red">Discard Changes</Button>,
    },
};

/**
 * Modal with disabled Cancel button.
 * Use `cancelDisabled` to prevent cancellation during async operations.
 * Notice the Cancel button is disabled while "saving".
 */
export const CancelDisabled: Story = {
    render: () => {
        const [isLoading, setIsLoading] = useState(true); // Start loading to show effect

        const handleToggle = () => {
            setIsLoading((prev) => !prev);
        };

        return (
            <MantineModal
                opened
                onClose={() => {}}
                title="Edit Evaluation"
                icon={IconSettings}
                size="lg"
                cancelDisabled={isLoading}
                leftActions={
                    <Button
                        variant="outline"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        disabled={isLoading}
                    >
                        Delete
                    </Button>
                }
                actions={
                    <Button loading={isLoading} onClick={handleToggle}>
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                }
            >
                <Stack>
                    <TextInput
                        label="Title"
                        defaultValue="Q4 Agent Evaluation"
                    />
                    <Textarea
                        label="Description"
                        defaultValue="Evaluate agent performance on sales queries"
                    />
                    <Text fz="xs" c="dimmed">
                        Notice the Cancel button is disabled while loading.
                        Click the Save button to toggle the loading state.
                    </Text>
                </Stack>
            </MantineModal>
        );
    },
};

/**
 * Different modal sizes.
 * Available sizes: 'sm' (380px), 'md' (480px), 'lg' (560px), 'xl' (700px), 'full', 'auto'.
 */
export const Sizes: Story = {
    render: () => {
        const [size, setSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
        const [opened, setOpened] = useState(false);

        return (
            <>
                <Group>
                    {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                        <Button
                            key={s}
                            variant={size === s ? 'filled' : 'default'}
                            onClick={() => {
                                setSize(s);
                                setOpened(true);
                            }}
                        >
                            {s.toUpperCase()}
                        </Button>
                    ))}
                </Group>

                <MantineModal
                    opened={opened}
                    onClose={() => setOpened(false)}
                    title={`Size: ${size}`}
                    size={size}
                    description={`This modal is using size="${size}".`}
                    actions={
                        <Button onClick={() => setOpened(false)}>Close</Button>
                    }
                />
            </>
        );
    },
};

/**
 * Multi-step modal with Back/Next navigation.
 * Uses the built-in Cancel button - just add Back in step 2.
 */
export const MultiStep: Story = {
    render: () => {
        const [opened, setOpened] = useState(true);
        const [step, setStep] = useState(1);

        const handleClose = () => {
            setOpened(false);
            setStep(1);
        };

        return (
            <>
                <Button onClick={() => setOpened(true)}>
                    Open Multi-Step Modal
                </Button>

                <MantineModal
                    opened={opened}
                    onClose={handleClose}
                    title="Create Dashboard"
                    icon={IconLayoutDashboard}
                    leftActions={
                        step === 2 ? (
                            <Button
                                variant="subtle"
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                New Space
                            </Button>
                        ) : null
                    }
                    actions={
                        step === 1 ? (
                            <Button onClick={() => setStep(2)}>Next</Button>
                        ) : (
                            <>
                                <Button
                                    variant="default"
                                    onClick={() => setStep(1)}
                                >
                                    Back
                                </Button>
                                <Button onClick={handleClose}>Create</Button>
                            </>
                        )
                    }
                >
                    {step === 1 ? (
                        <Stack>
                            <TextInput
                                label="Dashboard name"
                                placeholder="eg. KPI Dashboard"
                                required
                            />
                            <Textarea
                                label="Description"
                                placeholder="A few words to give your team some context"
                            />
                        </Stack>
                    ) : (
                        <Stack>
                            <Text fz="sm" fw={500}>
                                Select a space to save your dashboard:
                            </Text>
                            <Callout variant="info">
                                Space selector would go here...
                            </Callout>
                        </Stack>
                    )}
                </MantineModal>
            </>
        );
    },
};

/**
 * Modal with a form.
 * Use form `id` and button `form` attribute to connect them.
 */
export const WithForm: Story = {
    render: () => {
        const [opened, setOpened] = useState(false);

        const form = useForm({
            initialValues: {
                name: '',
                description: '',
            },
        });

        const handleSubmit = form.onSubmit((values) => {
            console.log('Form submitted:', values);
            setOpened(false);
            form.reset();
        });

        return (
            <>
                <Button onClick={() => setOpened(true)}>Open Form Modal</Button>

                <MantineModal
                    title="Create Chart"
                    opened={opened}
                    onClose={() => setOpened(false)}
                    icon={IconSettings}
                    actions={
                        <Button
                            type="submit"
                            form="create-chart-form"
                            disabled={!form.values.name}
                        >
                            Create
                        </Button>
                    }
                >
                    <form id="create-chart-form" onSubmit={handleSubmit}>
                        <Stack>
                            <TextInput
                                label="Chart name"
                                required
                                placeholder="Enter a name"
                                {...form.getInputProps('name')}
                            />
                            <Textarea
                                label="Description"
                                placeholder="Optional description"
                                {...form.getInputProps('description')}
                            />
                        </Stack>
                    </form>
                </MantineModal>
            </>
        );
    },
};

/**
 * Scrollable content.
 * The modal body automatically scrolls when content exceeds viewport height.
 * Header and footer remain fixed while content scrolls.
 */
export const ScrollableContent: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Select Team Members',
        icon: IconUsers,
        description: 'Choose team members to add to this project:',
        children: (
            <Stack gap="xs">
                {Array.from({ length: 25 }, (_, i) => (
                    <Group
                        key={i}
                        p="sm"
                        style={{
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 'var(--mantine-radius-md)',
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                backgroundColor: `hsl(${
                                    (i * 37) % 360
                                }, 60%, 70%)`,
                            }}
                        />
                        <Stack gap={2}>
                            <Text fz="sm" fw={500}>
                                User {i + 1}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                user{i + 1}@example.com
                            </Text>
                        </Stack>
                    </Group>
                ))}
            </Stack>
        ),
        actions: <Button>Add Selected</Button>,
    },
};

/**
 * Modal with a scrollable list inside an alert.
 * Use ScrollArea.Autosize for scrollable sections within modal content.
 */
export const ScrollableListInAlert: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Delete Chart',
        icon: IconTrash,
        description:
            'Are you sure you want to delete "Monthly Revenue"? This action cannot be undone.',
        children: (
            <Callout
                variant="warning"
                title="This chart is used in 15 dashboards:"
            >
                <ScrollArea.Autosize mah={150}>
                    <List size="sm">
                        {Array.from({ length: 15 }, (_, i) => (
                            <List.Item key={i}>
                                {
                                    [
                                        'Executive Summary',
                                        'Sales Overview',
                                        'Marketing KPIs',
                                        'Finance Dashboard',
                                        'Q4 Review',
                                        'Weekly Metrics',
                                        'Team Performance',
                                        'Customer Insights',
                                        'Product Analytics',
                                        'Revenue Tracker',
                                        'Growth Dashboard',
                                        'Operations View',
                                        'Support Metrics',
                                        'Engineering Stats',
                                        'Company Overview',
                                    ][i]
                                }
                            </List.Item>
                        ))}
                    </List>
                </ScrollArea.Autosize>
            </Callout>
        ),
        actions: <Button color="red">Delete Anyway</Button>,
    },
};

/**
 * Modal with multiple scrollable sections.
 * Shows how to handle complex layouts with multiple lists.
 */
export const MultipleScrollableSections: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Transfer Items',
        icon: IconFolderShare,
        size: 'xl',
        description: 'Review items to be transferred:',
        children: (
            <Stack>
                <div>
                    <Text fz="sm" fw={600} mb="xs">
                        Charts (8)
                    </Text>
                    <ScrollArea.Autosize mah={120} offsetScrollbars>
                        <List
                            size="sm"
                            icon={<MantineIcon icon={IconList} size={14} />}
                        >
                            {[
                                'Monthly Revenue',
                                'User Growth',
                                'Conversion Funnel',
                                'Customer LTV',
                                'Churn Rate',
                                'MRR Breakdown',
                                'Feature Usage',
                                'Support Tickets',
                            ].map((name) => (
                                <List.Item key={name}>{name}</List.Item>
                            ))}
                        </List>
                    </ScrollArea.Autosize>
                </div>

                <div>
                    <Text fz="sm" fw={600} mb="xs">
                        Dashboards (5)
                    </Text>
                    <ScrollArea.Autosize mah={100} offsetScrollbars>
                        <List
                            size="sm"
                            icon={
                                <MantineIcon
                                    icon={IconLayoutDashboard}
                                    size={14}
                                />
                            }
                        >
                            {[
                                'Executive Summary',
                                'Sales Overview',
                                'Marketing KPIs',
                                'Product Analytics',
                                'Team Performance',
                            ].map((name) => (
                                <List.Item key={name}>{name}</List.Item>
                            ))}
                        </List>
                    </ScrollArea.Autosize>
                </div>

                <Callout variant="info">
                    All items will be moved to the selected destination space.
                </Callout>
            </Stack>
        ),
        actions: <Button>Transfer All</Button>,
    },
};
