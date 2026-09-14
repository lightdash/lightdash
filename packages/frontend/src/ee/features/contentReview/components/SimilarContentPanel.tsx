import {
    ContentReviewContentType,
    type ContentReviewSimilarContentItem,
} from '@lightdash/common';
import { Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useId, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { getContentHref } from '../utils';
import ContentReviewItemRow from './ContentReviewItemRow';
import classes from './SimilarContentPanel.module.css';

const VISIBLE_ROWS = 3;

type Props = {
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string | null;
    variant?: 'review' | 'save';
    items: ContentReviewSimilarContentItem[];
};

const SimilarContentPanel: FC<Props> = ({
    projectUuid,
    contentType,
    contentUuid,
    items,
    variant = 'review',
}) => {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const resultsId = useId();
    const { track } = useTracking();
    if (items.length === 0) return null;
    const noun =
        contentType === ContentReviewContentType.DASHBOARD
            ? 'dashboard'
            : 'chart';
    const hidden = Math.max(items.length - VISIBLE_ROWS, 0);
    const visible = showAll ? items : items.slice(0, VISIBLE_ROWS);
    return (
        <Stack gap="xs">
            <UnstyledButton
                type="button"
                className={classes.disclosure}
                aria-expanded={expanded}
                aria-controls={resultsId}
                onClick={() => setExpanded((current) => !current)}
            >
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconInfoCircle} size="sm" />
                    <Text fz="xs" inherit>
                        {items.length} similar {noun}
                        {items.length === 1 ? '' : 's'} found
                    </Text>
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size="sm"
                    />
                </Group>
            </UnstyledButton>
            <div id={resultsId} hidden={!expanded}>
                {expanded && (
                    <Stack gap={0} className={classes.results}>
                        {visible.map((item) => (
                            <ContentReviewItemRow
                                key={item.contentUuid}
                                contentType={item.contentType}
                                name={item.name}
                                meta={`${item.matchReason === 'same_name' ? 'Same name' : 'Similar name'} · in ${item.spaceName}`}
                                href={getContentHref(
                                    projectUuid,
                                    item.contentType,
                                    item,
                                )}
                                isVerified={item.isVerified}
                                onClick={() =>
                                    contentUuid &&
                                    variant === 'review' &&
                                    track({
                                        name: EventName.CONTENT_REVIEW_SIMILAR_CONTENT_CLICKED,
                                        properties: {
                                            projectId: projectUuid,
                                            contentType,
                                            contentId: contentUuid,
                                            similarContentId: item.contentUuid,
                                            similarContentIsVerified:
                                                item.isVerified,
                                        },
                                    })
                                }
                            />
                        ))}
                        {hidden > 0 && (
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                className={classes.toggle}
                                onClick={() =>
                                    setShowAll((current) => !current)
                                }
                            >
                                {showAll ? 'Show fewer' : `Show ${hidden} more`}
                            </Button>
                        )}
                    </Stack>
                )}
            </div>
        </Stack>
    );
};

export default SimilarContentPanel;
