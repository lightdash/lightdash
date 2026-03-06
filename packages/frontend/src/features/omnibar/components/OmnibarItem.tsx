import { Badge, Box, Group, Stack, Text } from '@mantine-8/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC, type MutableRefObject } from 'react';
import { useContentVerificationEnabled } from '../../../hooks/useContentVerificationEnabled';
import { type SearchItem } from '../types/searchItem';
import classes from './OmnibarItem.module.css';
import {
    OmnibarItemIcon,
    OmnibarItemIconWithIndicator,
} from './OmnibarItemIcon';

type Props = {
    projectUuid: string;
    canUserManageValidation: boolean;
    item: SearchItem;
    hovered?: boolean;
    scrollRef?: MutableRefObject<HTMLDivElement>;
    onClick?: (e: React.MouseEvent) => void;
};

const itemHasValidationError = (searchItem: SearchItem) =>
    searchItem.item &&
    ['dashboard', 'saved_chart', 'table'].includes(searchItem.type) &&
    'validationErrors' in searchItem.item &&
    searchItem.item.validationErrors?.length > 0;

const itemHasVerification = (searchItem: SearchItem) =>
    searchItem.item &&
    'verification' in searchItem.item &&
    searchItem.item.verification !== null &&
    searchItem.item.verification !== undefined;

const OmnibarItem: FC<Props> = ({
    item,
    projectUuid,
    canUserManageValidation,
    hovered,
    onClick,
    scrollRef,
}) => {
    const isContentVerificationEnabled = useContentVerificationEnabled();
    return (
        <Group
            role="menuitem"
            data-hovered={hovered || undefined}
            className={classes.action}
            tabIndex={-1}
            onClick={onClick}
            gap="sm"
            wrap="nowrap"
        >
            <Box className={classes.iconContainer}>
                {itemHasValidationError(item) ? (
                    <OmnibarItemIconWithIndicator
                        item={item}
                        projectUuid={projectUuid}
                        canUserManageValidation={canUserManageValidation}
                    />
                ) : (
                    <OmnibarItemIcon item={item} />
                )}
            </Box>

            <Stack gap="two" className={classes.content}>
                <Group gap="xs" wrap="nowrap">
                    <Text fw={500} size="sm" truncate ref={scrollRef}>
                        {item.prefix} {item.title}
                    </Text>
                    {isContentVerificationEnabled &&
                        itemHasVerification(item) && (
                            <Badge
                                size="xs"
                                variant="light"
                                color="green"
                                leftSection={
                                    <IconCircleCheckFilled size={10} />
                                }
                                style={{ flexShrink: 0 }}
                            >
                                Verified
                            </Badge>
                        )}
                </Group>

                {item.description || item.typeLabel ? (
                    <Text size="xs" truncate c="dimmed">
                        {item.typeLabel}
                        {item.typeLabel && item.description ? <> · </> : null}
                        {item.description}
                    </Text>
                ) : null}
            </Stack>
        </Group>
    );
};

export default OmnibarItem;
