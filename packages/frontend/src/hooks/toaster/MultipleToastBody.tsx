import {
    ActionIcon,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useState, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import { type NotificationData } from './types';

const MultipleToastBody = ({
    toastsData,
    onCloseError,
}: {
    title?: ReactNode;
    toastsData: NotificationData[];
    onCloseError?: (errorData: NotificationData) => void;
}) => {
    const theme = useMantineTheme();
    const isDark = theme.colorScheme === 'dark';
    const [listCollapsed, setListCollapsed] = useState(true);

    return (
        <Stack spacing="xs" align="stretch">
            <Group>
                <Title order={6} color={isDark ? 'red.4' : 'red.9'}>
                    Errors
                </Title>
                <Button
                    size="xs"
                    compact
                    variant="outline"
                    color={isDark ? 'red.4' : 'red.8'}
                    styles={{
                        root: {
                            backgroundColor: isDark
                                ? theme.fn.darken(theme.colors.red[9], 0.6)
                                : theme.colors.red[1],
                            border: `1px solid ${
                                isDark
                                    ? theme.colors.red[9]
                                    : theme.colors.red[2]
                            }`,
                        },
                    }}
                    rightIcon={
                        <MantineIcon
                            color={isDark ? 'red.4' : 'red.8'}
                            icon={
                                listCollapsed ? IconChevronUp : IconChevronDown
                            }
                        />
                    }
                    onClick={() => setListCollapsed(!listCollapsed)}
                >
                    <Text color={isDark ? 'red.1' : 'red.9'}>{`${
                        listCollapsed ? 'Show' : 'Hide'
                    } ${toastsData.length}`}</Text>
                </Button>
            </Group>

            <Collapse
                in={!listCollapsed}
                style={{
                    maxHeight: 155,
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Stack spacing="xs" pb="sm">
                    {toastsData.map((toastData, index) => (
                        <Group
                            key={`${toastData.subtitle}-${index}`}
                            position="apart"
                            spacing="xxs"
                            noWrap
                            sx={{
                                width: '100%',
                                border: `1px solid ${
                                    isDark
                                        ? theme.colors.red[9]
                                        : theme.colors.red[2]
                                }`,
                                borderRadius: '4px',
                                padding: theme.spacing.xs,
                                backgroundColor: isDark
                                    ? theme.fn.darken(theme.colors.red[9], 0.7)
                                    : theme.colors.red[0],
                            }}
                        >
                            {toastData.apiError ? (
                                <ApiErrorDisplay
                                    apiError={toastData.apiError}
                                    onClose={() => onCloseError?.(toastData)}
                                />
                            ) : (
                                <>
                                    {toastData.title && (
                                        <Title
                                            order={6}
                                            color={isDark ? 'red.2' : 'red.9'}
                                        >
                                            {toastData.title}
                                        </Title>
                                    )}
                                    {toastData.subtitle && (
                                        <MarkdownPreview
                                            source={toastData.subtitle.toString()}
                                            rehypePlugins={[
                                                [
                                                    rehypeExternalLinks,
                                                    { target: '_blank' },
                                                ],
                                            ]}
                                            style={{
                                                backgroundColor: 'transparent',
                                                color: isDark
                                                    ? theme.colors.red[2]
                                                    : theme.colors.red[9],
                                                fontSize: '12px',
                                            }}
                                        />
                                    )}
                                </>
                            )}

                            <ActionIcon
                                variant="transparent"
                                size="xs"
                                onClick={() => onCloseError?.(toastData)}
                            >
                                <MantineIcon
                                    icon={IconX}
                                    color={isDark ? 'red.4' : 'red.9'}
                                />
                            </ActionIcon>
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Stack>
    );
};

export default MultipleToastBody;
