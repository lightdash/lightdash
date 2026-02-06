import {
    ActionIcon,
    Box,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    Title,
    useMantineColorScheme,
} from '@mantine-8/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useState, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import { type NotificationData } from './types';
import styles from './MultipleToastBody.module.css';

const MultipleToastBody = ({
    toastsData,
    onCloseError,
}: {
    title?: ReactNode;
    toastsData: NotificationData[];
    onCloseError?: (errorData: NotificationData) => void;
}) => {
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';
    const [listCollapsed, setListCollapsed] = useState(true);

    return (
        <Stack gap="xs" align="stretch">
            <Group>
                <Title
                    className={styles.errorsTitle}
                    order={6}
                >
                    Errors
                </Title>
                <Button
                    className={styles.toggleButton}
                    size="compact-xs"
                    variant="outline"
                    color={isDark ? 'red.4' : 'red.8'}
                    rightSection={
                        <MantineIcon
                            color={isDark ? 'red.4' : 'red.8'}
                            icon={
                                listCollapsed ? IconChevronUp : IconChevronDown
                            }
                        />
                    }
                    onClick={() => setListCollapsed(!listCollapsed)}
                >
                    <Text className={styles.toggleButtonText}>{`${
                        listCollapsed ? 'Show' : 'Hide'
                    } ${toastsData.length}`}</Text>
                </Button>
            </Group>

            <Box className={styles.collapseContainer}>
                <Collapse in={!listCollapsed}>
                    <Stack gap="xs" pb="sm">
                        {toastsData.map((toastData, index) => (
                            <Group
                                className={styles.errorItem}
                                key={`${toastData.subtitle}-${index}`}
                                justify="space-between"
                                gap="xxs"
                                wrap="nowrap"
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
                                                className={styles.errorItemTitle}
                                                order={6}
                                            >
                                                {toastData.title}
                                            </Title>
                                        )}
                                        {toastData.subtitle && (
                                            <MarkdownPreview
                                                className={styles.markdownPreview}
                                                source={toastData.subtitle.toString()}
                                                rehypePlugins={[
                                                    [
                                                        rehypeExternalLinks,
                                                        { target: '_blank' },
                                                    ],
                                                ]}
                                            />
                                        )}
                                    </>
                                )}

                                <ActionIcon
                                    className={styles.closeButton}
                                    variant="transparent"
                                    size="xs"
                                    onClick={() => onCloseError?.(toastData)}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            </Group>
                        ))}
                    </Stack>
                </Collapse>
            </Box>
        </Stack>
    );
};

export default MultipleToastBody;
