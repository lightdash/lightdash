import { Box, Collapse, Group, Stack, UnstyledButton } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useState } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import ApiErrorDisplay from './ApiErrorDisplay';
import styles from './MultipleToastBody.module.css';
import { type NotificationData } from './types';

const MultipleToastBody = ({
    toastsData,
}: {
    toastsData: NotificationData[];
}) => {
    const [expanded, setExpanded] = useState(false);
    const newest = toastsData[toastsData.length - 1];
    const older = toastsData.slice(0, -1).reverse();

    return (
        <Stack gap={0} align="stretch">
            {!expanded && older.length > 0 && (
                <Box data-toast-peek-marker={older.length} />
            )}

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
                            {older.map((toastData) => (
                                <Group
                                    key={toastData.messageKey}
                                    className={styles.olderItem}
                                    gap={12}
                                    align="baseline"
                                    wrap="nowrap"
                                >
                                    <Box className={styles.olderMessage}>
                                        {toastData.apiError
                                            ? toastData.apiError.message
                                            : toastData.subtitle ||
                                              toastData.title}
                                    </Box>
                                    {toastData.receivedAt && (
                                        <Box className={styles.olderTime}>
                                            {toastData.receivedAt}
                                        </Box>
                                    )}
                                </Group>
                            ))}
                        </Box>
                    </Collapse>
                </>
            )}
        </Stack>
    );
};

export default MultipleToastBody;
