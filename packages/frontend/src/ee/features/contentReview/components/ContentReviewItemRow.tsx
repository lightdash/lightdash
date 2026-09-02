import { type ContentReviewContentType } from '@lightdash/common';
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { IconCircleCheckFilled, IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { IconBox } from '../../../../components/common/ResourceIcon';
import {
    getContentTypeColor,
    getContentTypeIcon,
    getContentTypeLabel,
} from '../utils';
import classes from './ContentReviewItemRow.module.css';

type Props = {
    contentType: ContentReviewContentType;
    name: string;
    meta?: string;
    href?: string;
    isVerified?: boolean;
};

// One chart or dashboard, as a row in a list. Links open in a new tab so the
// modal or request page underneath stays put.
const ContentReviewItemRow: FC<Props> = ({
    contentType,
    name,
    meta,
    href,
    isVerified = false,
}) => {
    const body = (
        <Group gap="sm" wrap="nowrap" className={classes.row}>
            <IconBox
                icon={getContentTypeIcon(contentType)}
                color={getContentTypeColor(contentType)}
                boxSize={28}
                size="md"
            />
            <Stack gap={0} className={classes.text}>
                <Text fz="sm" fw={500} lineClamp={1}>
                    {name}
                </Text>
                <Text fz="xs" c="dimmed" lineClamp={1}>
                    {meta ?? getContentTypeLabel(contentType)}
                </Text>
            </Stack>
            {isVerified && (
                <Badge
                    size="xs"
                    color="green"
                    variant="light"
                    leftSection={
                        <MantineIcon icon={IconCircleCheckFilled} size={10} />
                    }
                >
                    Verified
                </Badge>
            )}
            {href && (
                <MantineIcon
                    icon={IconExternalLink}
                    color="dimmed"
                    className={classes.linkIcon}
                />
            )}
        </Group>
    );

    if (!href) return body;
    return (
        <Anchor
            href={href}
            target="_blank"
            rel="noreferrer"
            c="inherit"
            underline="never"
            className={classes.link}
        >
            {body}
        </Anchor>
    );
};

export default ContentReviewItemRow;
