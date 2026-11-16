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

const STOPS = {
    server: ['Ask', 'Review', 'Publish'],
    repo: ['Ask', 'Review', 'Merge'],
};

/** What the chat shows before a conversation starts. */
export const StudioChatEmptyState: FC<{
    keepsDraft: boolean;
    children?: ReactNode;
}> = ({ keepsDraft, children }) => (
    <Stack flex={1} justify="center" align="center" gap="md" px="md">
        <Stack gap={2} align="center" maw={280}>
            <Text fz="sm" fw={600}>
                Draft changes by asking
            </Text>
            <Text fz="xs" c="dimmed" ta="center">
                {keepsDraft
                    ? 'Only you see a draft until you publish it.'
                    : 'Nothing goes live until the pull request merges.'}
            </Text>
        </Stack>
        <Box className={classes.flow}>
            <FlowScene />
            <Box className={classes.captions}>
                {STOPS[keepsDraft ? 'server' : 'repo'].map((title, index) => (
                    <Box key={title} className={classes.stop}>
                        <Box className={classes.node}>{index + 1}</Box>
                        <Text fz="xs" c="dimmed">
                            {title}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
        {children}
    </Stack>
);
