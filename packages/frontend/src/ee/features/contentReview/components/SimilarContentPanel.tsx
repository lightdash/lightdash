import { type ContentReviewSimilarContentItem } from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getContentHref } from '../utils';
import ContentReviewItemRow from './ContentReviewItemRow';
import classes from './SimilarContentPanel.module.css';

const VISIBLE_ROWS = 3;

type Props = {
    projectUuid: string;
    items: ContentReviewSimilarContentItem[];
};

const SimilarContentPanel: FC<Props> = ({ projectUuid, items }) => {
    const [showAll, setShowAll] = useState(false);
    if (items.length === 0) return null;
    const hidden = Math.max(items.length - VISIBLE_ROWS, 0);
    const visible = showAll ? items : items.slice(0, VISIBLE_ROWS);
    return (
        <Paper className={classes.panel}>
            <Group gap="sm" wrap="nowrap" className={classes.header}>
                <MantineIcon icon={IconAlertTriangle} color="yellow.7" />
                <Stack gap={0}>
                    <Text fz="sm" fw={500}>
                        {items.length === 1
                            ? 'Something similar already exists'
                            : 'Similar content already exists'}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Have a look before you submit. If yours adds something,
                        say what in the note so reviewers know.
                    </Text>
                </Stack>
            </Group>
            <Stack gap={0} p={4}>
                {visible.map((item) => (
                    <ContentReviewItemRow
                        key={item.contentUuid}
                        contentType={item.contentType}
                        name={item.name}
                        meta={`in ${item.spaceName}`}
                        href={getContentHref(
                            projectUuid,
                            item.contentType,
                            item,
                        )}
                        isVerified={item.isVerified}
                        compact
                    />
                ))}
                {hidden > 0 && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        className={classes.toggle}
                        onClick={() => setShowAll((current) => !current)}
                    >
                        {showAll ? 'Show fewer' : `Show ${hidden} more`}
                    </Button>
                )}
            </Stack>
        </Paper>
    );
};

export default SimilarContentPanel;
