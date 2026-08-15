import {
    Box,
    Button,
    Group,
    Notification,
    Paper,
    Progress,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconArrowRight,
    IconCircleCheck,
    IconInfoCircle,
    IconReload,
    type Icon,
} from '@tabler/icons-react';
import { useRef, type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import ApiErrorDisplay from '../hooks/toaster/ApiErrorDisplay';
import MultipleToastBody from '../hooks/toaster/MultipleToastBody';
import { type ToastVariant } from '../hooks/toaster/types';
import useToaster from '../hooks/toaster/useToaster';
import toastStyles from '../hooks/toaster/useToaster.module.css';

const LONG_SQL_ERROR_MESSAGE =
    "SQL compilation error:\nsyntax error line 12 at position 8 unexpected 'AS'.\nexpression GROUP BY position 4 is not in select list.\nThe query referenced 3 columns that are not part of the select list: order_total, order_date, customer_id.\n\ncompiled SQL:\nSELECT\n  order_date,\n  customer_id,\n  SUM(order_total) AS AS total\nFROM analytics.orders\nWHERE order_date >= '2026-01-01'\nGROUP BY 1, 4\nORDER BY total DESC\nLIMIT 500";

const ToasterDemo = () => {
    const {
        showToastSuccess,
        showToastError,
        showToastInfo,
        showToastWarning,
        showToastApiError,
        addToastError,
    } = useToaster();
    const errorCounter = useRef(0);

    return (
        <Stack gap="xl" p="xl" maw={800}>
            <Box component="section">
                <Title order={4} mb="md">
                    Standard Toasts
                </Title>
                <Group>
                    <Button
                        color="green"
                        onClick={() =>
                            showToastSuccess({
                                title: 'Success',
                                subtitle:
                                    'Your changes have been saved successfully!',
                            })
                        }
                    >
                        Success
                    </Button>
                    <Button
                        color="red"
                        onClick={() =>
                            showToastError({
                                title: 'Error',
                                subtitle:
                                    'Something went wrong while saving your changes.',
                            })
                        }
                    >
                        Error
                    </Button>
                    <Button
                        color="indigo"
                        onClick={() =>
                            showToastInfo({
                                title: 'Info',
                                subtitle: 'This is an informational message.',
                            })
                        }
                    >
                        Info
                    </Button>
                    <Button
                        color="yellow"
                        onClick={() =>
                            showToastWarning({
                                title: 'Warning',
                                subtitle:
                                    'Please review your changes before proceeding.',
                            })
                        }
                    >
                        Warning
                    </Button>
                    <Button
                        color="gray"
                        onClick={() =>
                            showToastInfo({
                                title: 'Loading',
                                subtitle: 'Processing your request...',
                                loading: true,
                            })
                        }
                    >
                        Loading
                    </Button>
                    <Button
                        color="green"
                        variant="outline"
                        onClick={() =>
                            showToastSuccess({ title: 'Copied to clipboard' })
                        }
                    >
                        Title Only
                    </Button>
                </Group>
            </Box>

            <Box component="section">
                <Title order={4} mb="md">
                    Advanced Toasts
                </Title>
                <Group>
                    <Button
                        variant="outline"
                        color="red"
                        onClick={() =>
                            showToastApiError({
                                title: 'API Error',
                                apiError: {
                                    name: 'ApiError',
                                    message:
                                        'The server responded with an error (500).',
                                    statusCode: 500,
                                    data: {
                                        error: 'The server responded with an error (500).',
                                    },
                                },
                            })
                        }
                    >
                        API Error
                    </Button>

                    <Button
                        variant="outline"
                        color="red"
                        onClick={() =>
                            showToastApiError({
                                title: 'Query failed',
                                apiError: {
                                    name: 'ApiError',
                                    message: LONG_SQL_ERROR_MESSAGE,
                                    statusCode: 400,
                                    sentryEventId: 'c3d4e5f6a7',
                                    sentryTraceId: 'b8c9d0e1f2',
                                    data: {},
                                },
                            })
                        }
                    >
                        Long API Error
                    </Button>

                    <Button
                        variant="outline"
                        color="red"
                        onClick={() => {
                            addToastError({
                                title: 'Error 1',
                                subtitle: 'The first error occurred.',
                            });
                            setTimeout(() => {
                                addToastError({
                                    title: 'Error 2',
                                    subtitle: 'The second error occurred.',
                                });
                            }, 500);
                        }}
                    >
                        Multiple Errors
                    </Button>

                    <Button
                        variant="outline"
                        color="red"
                        onClick={() => {
                            errorCounter.current += 1;
                            addToastError({
                                title: `Error ${errorCounter.current}`,
                                subtitle: `Something went wrong (#${errorCounter.current}).`,
                            });
                        }}
                    >
                        Add Error
                    </Button>

                    <Button
                        variant="outline"
                        color="red"
                        onClick={() => {
                            addToastError({
                                title: "Chart 'Revenue by month': Error",
                                apiError: {
                                    name: 'ApiError',
                                    message:
                                        'Query exceeded the maximum execution time.',
                                    statusCode: 500,
                                    sentryEventId: 'a1b2c3d4e5',
                                    sentryTraceId: 'f6a7b8c9d0',
                                    data: {},
                                },
                            });
                            setTimeout(() => {
                                addToastError({
                                    title: "Chart 'Orders funnel': Error",
                                    apiError: {
                                        name: 'ApiError',
                                        message:
                                            'Compilation failed: unknown dimension `orders.status`.',
                                        statusCode: 400,
                                        sentryEventId: 'b2c3d4e5f6',
                                        sentryTraceId: 'a7b8c9d0e1',
                                        data: {},
                                    },
                                });
                            }, 600);
                        }}
                    >
                        Grouped API Errors
                    </Button>

                    <Button
                        variant="outline"
                        color="indigo"
                        onClick={() => {
                            const key = 'job-progress-demo';
                            showToastInfo({
                                key,
                                title: 'Refreshing dbt project',
                                subtitle: 'Compiling models...',
                                loading: true,
                                autoClose: false,
                                withCloseButton: false,
                                action: {
                                    children: 'View log',
                                    icon: IconArrowRight,
                                    onClick: () => {},
                                },
                            });
                            setTimeout(() => {
                                showToastSuccess({
                                    key,
                                    title: 'Project refreshed',
                                });
                            }, 2500);
                        }}
                    >
                        Job Progress
                    </Button>
                </Group>
            </Box>

            <Box component="section">
                <Title order={4} mb="md">
                    Custom Content
                </Title>
                <Group>
                    <Button
                        variant="subtle"
                        onClick={() =>
                            showToastSuccess({
                                title: 'Action Toast',
                                subtitle: 'This toast has an action button.',
                                action: {
                                    children: 'Undo',
                                    onClick: () => console.log('Undo clicked'),
                                },
                            })
                        }
                    >
                        With Action
                    </Button>

                    <Button
                        variant="subtle"
                        onClick={() =>
                            showToastSuccess({
                                title: 'Markdown Toast',
                                subtitle:
                                    'This toast uses **markdown** in the _subtitle_. [Click here](https://google.com)',
                            })
                        }
                    >
                        Markdown
                    </Button>

                    <Button
                        variant="subtle"
                        onClick={() =>
                            showToastInfo({
                                key: 'new-version-available',
                                autoClose: false,
                                title: 'A new version of Lightdash is ready for you!',
                                action: {
                                    children: 'Use new version',
                                    icon: IconReload,
                                    onClick: () =>
                                        console.log('Use new version clicked'),
                                },
                            })
                        }
                    >
                        Version Update
                    </Button>
                </Group>
            </Box>

            <Box component="section">
                <Title order={4} mb="md">
                    MultipleToastBody Component (Standalone)
                </Title>
                <Paper withBorder p="lg" radius="md">
                    <MultipleToastBody
                        toastsData={[
                            {
                                title: 'First Error',
                                subtitle: 'Detailed error message 1',
                                messageKey: '1',
                                receivedAt: '12:01',
                            },
                            {
                                title: 'Second Error',
                                subtitle: 'Detailed error message 2',
                                messageKey: '2',
                                receivedAt: '12:03',
                            },
                            {
                                title: 'API Error',
                                apiError: {
                                    name: 'NetworkError',
                                    message: 'Connection timed out',
                                    statusCode: 502,
                                    sentryEventId: '12345',
                                    sentryTraceId: 'abcde',
                                    data: {},
                                },
                                messageKey: '3',
                                receivedAt: '12:04',
                            },
                        ]}
                    />
                </Paper>
            </Box>

            <Button variant="default" onClick={() => notifications.clean()}>
                Clean All Notifications
            </Button>
        </Stack>
    );
};

const toastClassNames = {
    root: toastStyles.root,
    title: toastStyles.title,
    description: toastStyles.description,
    closeButton: toastStyles.closeButton,
    icon: toastStyles.icon,
    loader: toastStyles.loader,
};

const TOAST_PREVIEW_ICONS: Record<ToastVariant, Icon> = {
    success: IconCircleCheck,
    error: IconAlertCircle,
    info: IconInfoCircle,
    warning: IconAlertTriangle,
};

const StaticToast = ({
    variant,
    title,
    subtitle,
    action,
    loading,
    withCloseButton,
    children,
}: {
    variant: ToastVariant;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    loading?: boolean;
    withCloseButton?: boolean;
    children?: ReactNode;
}) => (
    <Notification
        data-variant={variant}
        classNames={toastClassNames}
        loading={loading}
        withCloseButton={withCloseButton}
        loaderProps={{ size: 12, color: 'ldGray.6' }}
        closeButtonProps={{ 'aria-label': 'Dismiss notification' }}
        icon={
            loading ? undefined : (
                <MantineIcon icon={TOAST_PREVIEW_ICONS[variant]} size={18} />
            )
        }
        title={title}
        onClose={() => {}}
    >
        {children ??
            (subtitle || action ? (
                <Stack gap={0} align="flex-start">
                    {subtitle && (
                        <Box className={toastStyles.subtitle}>{subtitle}</Box>
                    )}
                    {action}
                </Stack>
            ) : undefined)}
    </Notification>
);

const StaticActionButton = ({
    label,
    icon,
}: {
    label: string;
    icon?: Icon;
}) => (
    <Button
        className={toastStyles.actionButton}
        size="xs"
        leftSection={icon ? <MantineIcon icon={icon} /> : undefined}
    >
        {label}
    </Button>
);

const STACKED_ERRORS_FIXTURE = [
    {
        subtitle: 'Permission denied on schema `finance`.',
        messageKey: 'a',
        receivedAt: '12:01',
    },
    {
        title: "Chart 'Revenue by month': Error",
        apiError: {
            name: 'ApiError',
            message: 'Query exceeded the maximum execution time.',
            statusCode: 500,
            sentryEventId: 'a1b2c3d4e5',
            sentryTraceId: 'f6a7b8c9d0',
            data: {},
        },
        messageKey: 'b',
        receivedAt: '12:03',
    },
    {
        subtitle: 'Column `order_total` does not exist in `analytics.orders`.',
        messageKey: 'c',
        receivedAt: '12:04',
    },
];

const StaticJobProgressBody = () => (
    <Box className={toastStyles.subtitle}>
        <Text fz="xs" ff="monospace" mb={4}>
            validate_dashboards
        </Text>
        <Text fz="xs" mb={4}>
            3 of 5 completed
        </Text>
        <Progress.Root size="sm">
            <Progress.Section value={60} color="green" />
            <Progress.Section value={20} color="red" />
        </Progress.Root>
        <Text fz="xs" c="red" mt={4}>
            1 failed
        </Text>
    </Box>
);

const InlineGalleryDemo = () => (
    <Stack gap="xl" p="xl" w={860}>
        <Box component="section">
            <Title order={4} mb="md">
                Neutral
            </Title>
            <Group align="flex-start" gap="md">
                <Box w={400}>
                    <StaticToast
                        variant="success"
                        title="Dashboard saved"
                        subtitle="Support Metrics · 2 seconds ago"
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="info"
                        title="Results limited to 500 rows"
                        subtitle="Increase the limit in query settings."
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="info"
                        title="Running query"
                        subtitle="Snowflake · 8s elapsed"
                        loading
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="success"
                        title="Chart deleted"
                        subtitle="Revenue by month"
                        action={<StaticActionButton label="Undo" />}
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="info"
                        title="A new version of Lightdash is ready for you!"
                        action={
                            <StaticActionButton
                                label="Use new version"
                                icon={IconReload}
                            />
                        }
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="success"
                        title="Copied to clipboard"
                    />
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="info"
                        title="Validating content"
                        loading
                        withCloseButton={false}
                    >
                        <Stack gap={0} align="flex-start">
                            <StaticJobProgressBody />
                            <StaticActionButton
                                label="View log"
                                icon={IconArrowRight}
                            />
                        </Stack>
                    </StaticToast>
                </Box>
            </Group>
        </Box>

        <Box component="section">
            <Title order={4} mb="md">
                Warning
            </Title>
            <Box w={400}>
                <StaticToast
                    variant="warning"
                    title="Unsaved changes"
                    subtitle="Your filters won't apply until you save the dashboard."
                />
            </Box>
        </Box>

        <Box component="section">
            <Title order={4} mb="md">
                Error
            </Title>
            <Group align="flex-start" gap="md">
                <Box w={400}>
                    <StaticToast
                        variant="error"
                        title="Query failed"
                        subtitle="The server responded with an error (500)."
                    />
                </Box>
                <Box w={400}>
                    <StaticToast variant="error" title="Error">
                        <Box className={toastStyles.subtitle}>
                            <ApiErrorDisplay
                                apiError={{
                                    name: 'ApiError',
                                    message:
                                        'Query exceeded the maximum execution time.',
                                    statusCode: 500,
                                    sentryEventId: 'a1b2c3d4e5',
                                    sentryTraceId: 'f6a7b8c9d0',
                                    data: {},
                                }}
                            />
                        </Box>
                    </StaticToast>
                </Box>
                <Box w={400}>
                    <StaticToast
                        variant="error"
                        title={`${STACKED_ERRORS_FIXTURE.length} errors`}
                    >
                        <MultipleToastBody
                            toastsData={STACKED_ERRORS_FIXTURE}
                            onDismissError={() => {}}
                        />
                    </StaticToast>
                </Box>
                <Box w={400}>
                    <StaticToast variant="error" title="Query failed">
                        <Box className={toastStyles.subtitle}>
                            <ApiErrorDisplay
                                apiError={{
                                    name: 'ApiError',
                                    message: LONG_SQL_ERROR_MESSAGE,
                                    statusCode: 400,
                                    sentryEventId: 'c3d4e5f6a7',
                                    sentryTraceId: 'b8c9d0e1f2',
                                    data: {},
                                }}
                            />
                        </Box>
                    </StaticToast>
                </Box>
            </Group>
        </Box>

        <Box component="section">
            <Title order={4} mb="md">
                Error (expanded)
            </Title>
            {/* Expanded root is 680px wide with a -240px margin-left (it
                widens leftwards to stay right-anchored in the live stack);
                the wrapper offsets that so the card sits flush here. */}
            <Box w={440} ml={240}>
                <StaticToast variant="error" title="Query failed">
                    <Box className={toastStyles.subtitle}>
                        <ApiErrorDisplay
                            defaultExpanded
                            apiError={{
                                name: 'ApiError',
                                message: LONG_SQL_ERROR_MESSAGE,
                                statusCode: 400,
                                sentryEventId: 'c3d4e5f6a7',
                                sentryTraceId: 'b8c9d0e1f2',
                                data: {},
                            }}
                        />
                    </Box>
                </StaticToast>
            </Box>
        </Box>
    </Stack>
);

const meta: Meta = {
    title: 'Hooks/useToaster',
    component: ToasterDemo,
    parameters: {
        layout: 'centered',
    },
};

export default meta;

type Story = StoryObj<typeof ToasterDemo>;

export const Default: Story = {};

export const InlineGallery: Story = {
    render: () => <InlineGalleryDemo />,
};
