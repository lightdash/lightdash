import { Badge, Box, Group, Text } from '@mantine-8/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC, type MutableRefObject } from 'react';
import { type SearchItem } from '../types/searchItem';
import classes from './OmnibarItem.module.css';
import {
    OmnibarItemIcon,
    OmnibarItemIconWithIndicator,
} from './OmnibarItemIcon';
import { itemHasValidationError, itemHasVerification } from './utils';

type Props = {
    projectUuid: string;
    canUserManageValidation: boolean;
    item: SearchItem;
    hovered?: boolean;
    scrollRef?: MutableRefObject<HTMLDivElement>;
    onClick?: (e: React.MouseEvent) => void;
    /** Fired on real pointer movement (not scroll-induced mouseenter), so
     * keyboard-scrolling rows under a parked cursor can't steal the focus. */
    onMouseMove?: () => void;
};

const OmnibarItem: FC<Props> = ({
    item,
    projectUuid,
    canUserManageValidation,
    hovered,
    onClick,
    onMouseMove,
    scrollRef,
}) => {
    return (
        <Group
            role="menuitem"
            data-hovered={hovered || undefined}
            className={classes.action}
            tabIndex={-1}
            onClick={onClick}
            onMouseMove={onMouseMove}
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
                    <OmnibarItemIcon item={item} boxSize={26} />
                )}
            </Box>

            <Group gap="xs" wrap="nowrap" className={classes.content}>
                <Text
                    fw={400}
                    size="sm"
                    truncate
                    ref={scrollRef}
                    className={classes.title}
                >
                    {item.prefix ? <>{item.prefix} </> : null}
                    {item.title}
                </Text>

                {item.contextLabel || item.description || item.typeLabel ? (
                    <Text size="xs" truncate className={classes.secondaryText}>
                        {item.contextLabel ? (
                            item.contextLabel
                        ) : (
                            <>
                                {item.typeLabel}
                                {item.typeLabel && item.description
                                    ? ' · '
                                    : null}
                                {item.description}
                            </>
                        )}
                    </Text>
                ) : null}

                {itemHasVerification(item) && (
                    <Badge
                        size="xs"
                        variant="light"
                        color="green"
                        leftSection={<IconCircleCheckFilled size={10} />}
                        className={classes.verifiedBadge}
                    >
                        Verified
                    </Badge>
                )}
            </Group>
        </Group>
    );
};

export default OmnibarItem;
