import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';

import { Box, Button, Paper, SimpleGrid, Stack, Text } from '@mantine-8/core';
import type { StackProps } from '@mantine/core';
import {
    IconAlertCircle,
    IconCheck,
    IconFileOff,
    IconInbox,
    IconMoodSad,
    IconSearch,
} from '@tabler/icons-react';
import type { MantineIconProps } from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';

interface SuboptimalStateProps extends StackProps {
    icon?: MantineIconProps['icon'];
    title?: string;
    description?: string | ReactNode;
    action?: ReactNode;
    loading?: boolean;
}

const meta: Meta<SuboptimalStateProps> = {
    component: SuboptimalState,
    decorators: [
        (Story: any) => (
            <Box bg="background" h={400} w="100%">
                <Story />
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj<SuboptimalStateProps>;

export const Error: Story = {
    args: {
        icon: IconAlertCircle,
        title: 'Error loading chart',
        description: 'Unable to fetch chart data. Please try again later.',
    },
};

export const ErrorWithAction: Story = {
    args: {
        icon: IconAlertCircle,
        title: 'Error',
        description: 'Something went wrong while processing your request.',
        action: (
            <Button variant="default" onClick={() => alert('Retry clicked')}>
                Retry
            </Button>
        ),
    },
};

export const EmptyState: Story = {
    args: {
        icon: IconInbox,
        title: 'No data available',
        description: 'There are no items to display at this time.',
    },
};

export const NoResults: Story = {
    args: {
        icon: IconSearch,
        title: 'No results found',
        description: 'Try adjusting your search or filter criteria.',
    },
};

export const Success: Story = {
    args: {
        icon: IconCheck,
        title: 'All done!',
        description: 'Your changes have been saved successfully.',
    },
};

export const DeletedChart: Story = {
    args: {
        icon: IconFileOff,
        title: 'Chart deleted',
        description: 'This chart has been removed from the dashboard.',
    },
};

export const Loading: Story = {
    args: {
        title: 'Loading...',
        loading: true,
    },
};

export const LoadingWithoutTitle: Story = {
    args: {
        loading: true,
    },
};

export const WithoutIcon: Story = {
    args: {
        title: 'No icon state',
        description: 'This is a suboptimal state without an icon.',
    },
};

export const TitleOnly: Story = {
    args: {
        icon: IconMoodSad,
        title: 'Something went wrong',
    },
};

export const WithCustomDescription: Story = {
    args: {
        icon: IconAlertCircle,
        title: 'Error',
        description: (
            <Stack gap="xs" align="center">
                <Text size="sm">Custom description with rich content:</Text>
                <ul style={{ textAlign: 'left', paddingLeft: '1rem' }}>
                    <li>First error detail</li>
                    <li>Second error detail</li>
                    <li>Third error detail</li>
                </ul>
            </Stack>
        ),
    },
};

export const LongDescription: Story = {
    args: {
        icon: IconAlertCircle,
        title: 'Connection Failed',
        description:
            'Unable to establish a connection to the database. This could be due to network issues, incorrect credentials, or the database server being down. Please check your connection settings and try again.',
    },
};

export const MultilineTitle: Story = {
    args: {
        icon: IconAlertCircle,
        title: 'Multiple lines in title\nThis is the second line\nAnd a third line',
        description: 'The title supports multiline text with pre-wrap.',
    },
};

export const AllVariants: Story = {
    render: () => (
        <Box bg="background" p="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Error loading chart"
                        description="Unable to fetch chart data."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Error"
                        description="Something went wrong."
                        action={
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => alert('Retry clicked')}
                            >
                                Retry
                            </Button>
                        }
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconInbox}
                        title="No data available"
                        description="There are no items to display."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconSearch}
                        title="No results found"
                        description="Try adjusting your filters."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconCheck}
                        title="All done!"
                        description="Changes saved successfully."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconFileOff}
                        title="Chart deleted"
                        description="This chart has been removed."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState title="Loading..." loading />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState loading />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        title="No icon state"
                        description="This is without an icon."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconMoodSad}
                        title="Something went wrong"
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Error"
                        description={
                            <Stack gap="xs" align="center">
                                <Text size="sm">Custom description:</Text>
                                <ul
                                    style={{
                                        textAlign: 'left',
                                        fontSize: '12px',
                                    }}
                                >
                                    <li>First error</li>
                                    <li>Second error</li>
                                </ul>
                            </Stack>
                        }
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Connection Failed"
                        description="Unable to connect. Check your settings and try again."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={'Multiple lines\nSecond line\nThird line'}
                        description="Title supports multiline."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconFileOff}
                        title="Placeholder"
                        description="Extra slot for more variants."
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconInbox}
                        title="Empty workspace"
                        description="Create your first project to get started."
                        action={
                            <Button
                                size="xs"
                                onClick={() => alert('Create clicked')}
                            >
                                Create Project
                            </Button>
                        }
                    />
                </Paper>

                <Paper withBorder p="md" h={300} bg="background">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Permission Denied"
                        description="You don't have access to view this resource."
                    />
                </Paper>
            </SimpleGrid>
        </Box>
    ),
};
