import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Stack,
    UnstyledButton,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useState } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay, { CopyErrorButton } from './ApiErrorDisplay';
import styles from './MultipleToastBody.module.css';
import { type NotificationData } from './types';

const MultipleToastBody = ({
    toastsData,
    onDismissError,
}: {
    toastsData: NotificationData[];
    onDismissError?: (messageKey: string) => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const newest = toastsData[toastsData.length - 1];
    const older = toastsData.slice(0, -1).reverse();

    return (
        <Stack gap={0} align="stretch">
            {newest.apiError ? (
                <ApiErrorDisplay apiError={newest.apiError} />
            ) : typeof newest.subtitle === 'string' ? (
                <MarkdownPreview
                    className={styles.markdown}
                    source={newest.subtitle}
                    rehypePlugins={[
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                />
            ) : (
                <Box className={styles.newestMessage}>
                    {newest.subtitle || newest.title}
                </Box>
            )}

            {older.length > 0 && (
                <>
                    <UnstyledButton
                        className={styles.toggle}
                        onClick={() => setExpanded(!expanded)}
                    >
                        {`${expanded ? 'Hide' : 'Show'} ${older.length} older`}
                    </UnstyledButton>

                    <Collapse in={expanded}>
                        <Box className={styles.olderList}>
                            {older.map((toastData) => {
                                const { messageKey } = toastData;
                                const olderText = toastData.apiError
                                    ? toastData.apiError.message
                                    : toastData.subtitle || toastData.title;

                                return (
                                    <Group
                                        key={toastData.messageKey}
                                        className={styles.olderItem}
                                        gap={12}
                                        align="flex-start"
                                        wrap="nowrap"
                                    >
                                        <Box className={styles.olderMessage}>
                                            {typeof olderText === 'string' ? (
                                                <MarkdownPreview
                                                    className={styles.markdown}
                                                    source={olderText}
                                                    rehypePlugins={[
                                                        [
                                                            rehypeExternalLinks,
                                                            {
                                                                target: '_blank',
                                                            },
                                                        ],
                                                    ]}
                                                />
                                            ) : (
                                                olderText
                                            )}
                                        </Box>
                                        {toastData.receivedAt && (
                                            <Box className={styles.olderTime}>
                                                {toastData.receivedAt}
                                            </Box>
                                        )}
                                        {toastData.apiError &&
                                            (toastData.apiError.sentryEventId ||
                                                toastData.apiError
                                                    .sentryTraceId) && (
                                                <CopyErrorButton
                                                    value={`${
                                                        toastData.apiError
                                                            .message
                                                    }\nError ID: ${
                                                        toastData.apiError
                                                            .sentryEventId ||
                                                        'n/a'
                                                    }\nTrace ID: ${
                                                        toastData.apiError
                                                            .sentryTraceId ||
                                                        'n/a'
                                                    }`}
                                                    color="ldGray.7"
                                                />
                                            )}
                                        {onDismissError && messageKey && (
                                            <ActionIcon
                                                aria-label="Dismiss error"
                                                className={styles.olderDismiss}
                                                size="xs"
                                                variant="transparent"
                                                onClick={() =>
                                                    onDismissError(messageKey)
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconX}
                                                    size={14}
                                                />
                                            </ActionIcon>
                                        )}
                                    </Group>
                                );
                            })}
                        </Box>
                    </Collapse>
                </>
            )}
        </Stack>
    );
};

export default MultipleToastBody;
