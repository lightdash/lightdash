import { Button, Group, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type Meta, type StoryObj } from '@storybook/react';
import MultipleToastBody from '../hooks/toaster/MultipleToastBody';
import useToaster from '../hooks/toaster/useToaster';

const ToasterDemo = () => {
    const {
        showToastSuccess,
        showToastError,
        showToastInfo,
        showToastPrimary,
        showToastWarning,
        showToastApiError,
        addToastError,
    } = useToaster();

    return (
        <Stack spacing="xl" p="xl" style={{ maxWidth: 800 }}>
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
                        color="blue"
                        onClick={() =>
                            showToastPrimary({
                                title: 'Primary',
                                subtitle: 'This is a primary action message.',
                            })
                        }
                    >
                        Primary
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
                            },
                            {
                                title: 'Second Error',
                                subtitle: 'Detailed error message 2',
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
                            },
                        ]}
                        onCloseError={(data) => console.log('Closed:', data)}
                    />
                </div>
            </section>

            <Button variant="default" onClick={() => notifications.clean()}>
                Clean All Notifications
            </Button>
        </Stack>
    );
};

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
