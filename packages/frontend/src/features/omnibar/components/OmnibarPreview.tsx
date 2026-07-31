import { SearchItemType } from '@lightdash/common';
import { Badge, Box, Group, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { type SearchItem } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import { OmnibarItemIcon } from './OmnibarItemIcon';
import classes from './OmnibarPreview.module.css';
import { itemHasValidationError, itemHasVerification } from './utils';

type Props = {
    item?: SearchItem;
    spaceName?: string;
};

const getKickerLabel = (item: SearchItem) => {
    if (item.typeLabel) return item.typeLabel;
    const label = getSearchItemLabel(item.type);
    // Group labels are plural; the kicker names a single item.
    return item.type === SearchItemType.SETTINGS
        ? label
        : label.replace(/s$/, '');
};

const Fact: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="xs" className={classes.factLabel}>
            {label}
        </Text>
        <Text size="xs" fw={500} truncate className={classes.factValue}>
            {children}
        </Text>
    </Group>
);

const OmnibarPreview: FC<Props> = ({ item, spaceName }) => {
    if (!item) {
        return (
            <Box className={`${classes.container} ${classes.empty}`}>
                <Text size="xs" c="dimmed" ta="center">
                    Hover or navigate to a result to preview it here.
                </Text>
            </Box>
        );
    }

    const hasError = itemHasValidationError(item);
    const hasVerification = itemHasVerification(item);

    const viewsCount =
        item.item && 'viewsCount' in item.item
            ? item.item.viewsCount
            : undefined;
    const createdBy =
        item.item && 'createdBy' in item.item && item.item.createdBy
            ? `${item.item.createdBy.firstName} ${item.item.createdBy.lastName}`
            : undefined;

    const hasFacts =
        spaceName !== undefined ||
        viewsCount !== undefined ||
        createdBy !== undefined;

    return (
        <Box className={classes.container}>
            <Group gap="xs" wrap="nowrap">
                <OmnibarItemIcon item={item} />
                <Text size="xs" fw={500} className={classes.kicker}>
                    {getKickerLabel(item)}
                </Text>
            </Group>

            <Text size="sm" fw={600} mt="sm" className={classes.title}>
                {item.prefix ? `${item.prefix} ` : ''}
                {item.title}
            </Text>

            {item.contextLabel || item.description ? (
                <Text size="xs" mt={6} className={classes.description}>
                    {item.contextLabel ?? item.description}
                </Text>
            ) : null}

            {hasFacts && (
                <Stack gap={6} mt="md" className={classes.facts}>
                    {spaceName !== undefined && (
                        <Fact label="Space">{spaceName}</Fact>
                    )}
                    {viewsCount !== undefined && (
                        <Fact label="Views">{viewsCount}</Fact>
                    )}
                    {createdBy !== undefined && (
                        <Fact label="Created by">{createdBy}</Fact>
                    )}
                </Stack>
            )}

            {(hasVerification || hasError) && (
                <Stack gap={6} mt="md">
                    {hasVerification && (
                        <Badge
                            size="xs"
                            variant="light"
                            color="green"
                            leftSection={<IconCircleCheckFilled size={10} />}
                            className={classes.flagBadge}
                        >
                            Verified
                        </Badge>
                    )}
                    {hasError && (
                        <Group gap={4} wrap="nowrap">
                            <IconAlertTriangle
                                size={12}
                                color="var(--mantine-color-red-6)"
                            />
                            <Text size="xs" c="red">
                                Has a validation error
                            </Text>
                        </Group>
                    )}
                </Stack>
            )}
        </Box>
    );
};

export default OmnibarPreview;
