import { Box, Stack, Text } from '@mantine/core';
import { IconCheck, IconSparkles } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './StudioChatEmptyState.module.css';

/** Three stops, left to right: the ask, the draft over what is live, and the change once it is live. */
const FlowScene: FC = () => (
    <Box className={classes.band} aria-hidden>
        <Box className={classes.scene}>
            <Box className={classes.ask} __vars={{ '--i': '0' }}>
                <MantineIcon icon={IconSparkles} size={10} />
                add a metric
            </Box>
            <Box className={classes.card} data-part="behind" />
            <Box
                className={classes.card}
                data-part="draft"
                __vars={{ '--i': '1' }}
            >
                <Box className={classes.title}>
                    model
                    <Box className={classes.tag}>Draft</Box>
                </Box>
                <Box className={classes.field}>dimension</Box>
                <Box className={classes.field}>metric</Box>
                <Box className={classes.added}>+ metric</Box>
            </Box>
            <Box
                className={classes.card}
                data-part="live"
                __vars={{ '--i': '2' }}
            >
                <Box className={classes.done}>
                    <MantineIcon icon={IconCheck} size={9} />
                </Box>
                <Box className={classes.title}>
                    model
                    <Box className={classes.tag}>Live</Box>
                </Box>
                <Box className={classes.field}>dimension</Box>
                <Box className={classes.field}>metric</Box>
                <Box className={classes.field} data-new>
                    metric
                </Box>
            </Box>
        </Box>
    </Box>
);

const STOPS: Record<'server' | 'repo', { title: string; detail: string }[]> = {
    server: [
        { title: 'Ask', detail: 'In your own words' },
        { title: 'Check the draft', detail: 'Only you see it' },
        { title: 'Publish', detail: 'Live for everyone' },
    ],
    repo: [
        { title: 'Ask', detail: 'In your own words' },
        { title: 'Check the diff', detail: 'Before it is saved' },
        { title: 'Pull request', detail: 'Live once it merges' },
    ],
};

/** What the chat shows before a conversation starts. */
export const StudioChatEmptyState: FC<{
    keepsDraft: boolean;
    children?: ReactNode;
}> = ({ keepsDraft, children }) => (
    <Stack flex={1} justify="center" align="center" gap="md" px="md">
        <Box className={classes.flow}>
            <FlowScene />
            <Box className={classes.captions}>
                {STOPS[keepsDraft ? 'server' : 'repo'].map(
                    ({ title, detail }, index) => (
                        <Box key={title} className={classes.stop}>
                            <Box className={classes.node}>{index + 1}</Box>
                            <Text fz="xs" fw={500}>
                                {title}
                            </Text>
                            <Text className={classes.detail}>{detail}</Text>
                        </Box>
                    ),
                )}
            </Box>
        </Box>
        {children}
    </Stack>
);
