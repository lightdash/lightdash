import { Box, Button, Group, Notification, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import {
    IconAlertCircle,
    IconAlertTriangle,
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
        <Stack gap="xl" p="xl" style={{ maxWidth: 800 }}>
            <section>
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
                </Group>
            </section>

            <section>
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
                </Group>
            </section>

            <section>
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
            </section>

            <section>
                <Title order={4} mb="md">
                    MultipleToastBody Component (Standalone)
                </Title>
                <div
                    style={{
                        border: '1px solid #eee',
                        padding: '20px',
                        borderRadius: '8px',
                    }}
                >
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
                </div>
            </section>

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
    children,
}: {
    variant: ToastVariant;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    loading?: boolean;
    children?: ReactNode;
}) => (
    <Notification
        data-variant={variant}
        classNames={toastClassNames}
        loading={loading}
        loaderProps={{ size: 18, color: 'ldGray.6' }}
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
        subtitle: 'Timeout after 60s while running `revenue_daily`.',
        messageKey: 'b',
        receivedAt: '12:03',
    },
    {
        subtitle: 'Column `order_total` does not exist in `analytics.orders`.',
        messageKey: 'c',
        receivedAt: '12:04',
    },
];

const InlineGalleryDemo = () => (
    <Stack gap="xl" p="xl" w={860}>
        <section>
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
            </Group>
        </section>

        <section>
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
        </section>

        <section>
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
                        />
                    </StaticToast>
                </Box>
            </Group>
        </section>
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
