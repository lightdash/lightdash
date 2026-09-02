import { type ContentReviewSimilarContentItem } from '@lightdash/common';
import { Group, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getContentHref, getContentTypeLabel } from '../utils';
import ContentReviewItemRow from './ContentReviewItemRow';
import classes from './SimilarContentPanel.module.css';

type Props = {
    projectUuid: string;
    items: ContentReviewSimilarContentItem[];
};

const SimilarContentPanel: FC<Props> = ({ projectUuid, items }) => {
    if (items.length === 0) return null;
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
                {items.map((item) => (
                    <ContentReviewItemRow
                        key={item.contentUuid}
                        contentType={item.contentType}
                        name={item.name}
                        meta={`${getContentTypeLabel(item.contentType)} in ${item.spaceName}`}
                        href={getContentHref(
                            projectUuid,
                            item.contentType,
                            item,
                        )}
                        isVerified={item.isVerified}
                    />
                ))}
            </Stack>
        </Paper>
    );
};

export default SimilarContentPanel;
