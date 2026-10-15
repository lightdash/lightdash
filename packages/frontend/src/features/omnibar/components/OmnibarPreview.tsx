import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type SearchItem } from '../types/searchItem';
import {
    getSearchItemSingularLabel,
    getSearchItemTypeLabel,
} from '../utils/getSearchItemLabel';
import { OmnibarItemIcon } from './OmnibarItemIcon';
import classes from './OmnibarPreview.module.css';
import { itemHasValidationError, itemHasVerification } from './utils';

type Props = {
    item?: SearchItem;
    spaceName?: string;
};

const getKickerLabel = (item: SearchItem) => {
    if (item.typeLabel) return getSearchItemTypeLabel(item.typeLabel);
    return getSearchItemSingularLabel(item.type);
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
    const { t } = useTranslation('omnibar');
    if (!item) {
        return (
            <Box className={`${classes.container} ${classes.empty}`}>
                <Text size="xs" c="dimmed" ta="center">
                    {t('preview.empty')}
                </Text>
            </Box>
        );
    }

    const hasError = itemHasValidationError(item);
    const hasVerification = itemHasVerification(item);

    const displaySpaceName = spaceName ?? item.recentContent?.space?.name;
    const viewsCount =
        item.recentContent?.views ??
        (item.item && 'viewsCount' in item.item
            ? item.item.viewsCount
            : undefined);
    const author =
        item.recentContent?.createdBy ??
        (item.item && 'createdBy' in item.item ? item.item.createdBy : null);
    const createdBy = author
        ? `${author.firstName} ${author.lastName}`
        : undefined;
    const hasFacts =
        displaySpaceName !== undefined ||
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
                    {displaySpaceName !== undefined && (
                        <Fact label={t('preview.space')}>
                            {displaySpaceName}
                        </Fact>
                    )}
                    {viewsCount !== undefined && (
                        <Fact label={t('preview.views')}>{viewsCount}</Fact>
                    )}
                    {createdBy !== undefined && (
                        <Fact label={t('preview.createdBy')}>{createdBy}</Fact>
                    )}
                </Stack>
            )}

            {(hasVerification || hasError) && (
                <Stack gap={6} mt="md">
                    {hasVerification && (
                        <Badge
                            size="xs"
                            color="green"
                            leftSection={<IconCircleCheckFilled size={10} />}
                            className={classes.flagBadge}
                        >
                            {t('preview.verified')}
                        </Badge>
                    )}
                    {hasError && (
                        <Group gap={4} wrap="nowrap">
                            <IconAlertTriangle
                                size={12}
                                color="var(--mantine-color-red-6)"
                            />
                            <Text size="xs" c="red">
                                {t('preview.validationError')}
                            </Text>
                        </Group>
                    )}
                </Stack>
            )}
        </Box>
    );
};

export default OmnibarPreview;
