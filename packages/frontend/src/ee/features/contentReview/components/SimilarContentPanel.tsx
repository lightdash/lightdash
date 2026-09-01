import { type ContentReviewSimilarContentItem } from '@lightdash/common';
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getContentHref, getContentTypeLabel } from '../utils';

type Props = {
    projectUuid: string;
    items: ContentReviewSimilarContentItem[];
};

const SimilarContentPanel: FC<Props> = ({ projectUuid, items }) => {
    if (items.length === 0) return null;
    return (
        <Callout
            variant="warning"
            title={`${items.length === 1 ? 'Something similar already exists' : 'Similar content already exists'}`}
        >
            <Stack gap="xs">
                <Text fz="sm">
                    Have a look before you submit. If yours adds something, say
                    what in the note so reviewers know.
                </Text>
                <Stack gap={4}>
                    {items.map((item) => (
                        <Group key={item.contentUuid} gap="xs" wrap="nowrap">
                            <Anchor
                                href={getContentHref(
                                    projectUuid,
                                    item.contentType,
                                    item,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                fz="sm"
                                fw={500}
                                truncate="end"
                            >
                                {item.name}
                            </Anchor>
                            <Text fz="xs" c="ldGray.6">
                                {getContentTypeLabel(item.contentType)} in{' '}
                                {item.spaceName}
                            </Text>
                            {item.isVerified && (
                                <Badge
                                    size="xs"
                                    color="green"
                                    variant="light"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconCircleCheckFilled}
                                            size={10}
                                        />
                                    }
                                >
                                    Verified
                                </Badge>
                            )}
                        </Group>
                    ))}
                </Stack>
            </Stack>
        </Callout>
    );
};

export default SimilarContentPanel;
