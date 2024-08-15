import { Box, Group, Stack, Text } from '@mantine/core';
import { createStyles } from '@mantine/emotion';
import { type FC, type MutableRefObject } from 'react';
import { type SearchItem } from '../types/searchItem';
import {
    OmnibarItemIcon,
    OmnibarItemIconWithIndicator,
} from './OmnibarItemIcon';

const useStyles = createStyles<string, null>((theme) => ({
    action: {
        display: 'flex',
        alignItems: 'center',
        height: theme.spacing['4xl'],
        paddingLeft: theme.spacing.xs,
        paddingRight: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        '&:hover, &[data-hovered]': {
            backgroundColor: theme.colors.blue[0],
        },
        '&:active': {
            backgroundColor: theme.colors.blue[1],
        },
    },
    item: {},
}));

type Props = {
    projectUuid: string;
    canUserManageValidation: boolean;
    item: SearchItem;
    styles?: Record<string, CSSObject>;
    classNames?: Record<string, string>;
    hovered?: boolean;
    scrollRef?: MutableRefObject<HTMLDivElement>;
    onClick: () => void;
};

const itemHasValidationError = (searchItem: SearchItem) =>
    searchItem.item &&
    ['dashboard', 'saved_chart', 'table'].includes(searchItem.type) &&
    'validationErrors' in searchItem.item &&
    searchItem.item.validationErrors?.length > 0;

const OmnibarItem: FC<Props> = ({
    item,
    styles,
    classNames,
    projectUuid,
    canUserManageValidation,
    hovered,
    onClick,
    scrollRef,
}) => {
    const { classes } = useStyles(null, {
        styles,
        classNames,
        name: 'SpotlightItem',
    });

    return (
        <Group
            role="menuitem"
            data-hovered={hovered || undefined}
            className={classes.action}
            tabIndex={-1}
            onClick={onClick}
            sx={{ radius: 'sm', cursor: 'pointer' }}
            spacing="sm"
            noWrap
        >
            <Box style={{ flexShrink: 0 }}>
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

            <Stack spacing="two" style={{ flexGrow: 1, overflow: 'hidden' }}>
                <Text fw={500} size="sm" truncate ref={scrollRef}>
                    {item.prefix} {item.title}
                </Text>

                {item.description || item.typeLabel ? (
                    <Text size="xs" truncate color="dimmed">
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
