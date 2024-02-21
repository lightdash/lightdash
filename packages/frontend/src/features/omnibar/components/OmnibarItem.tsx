import {
    Box,
    createStyles,
    CSSObject,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import { FC } from 'react';
import { SearchItem } from '../types/searchItem';
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
        '&[data-hovered]': {
            backgroundColor: theme.colors.blue[6],
        },
        '&:hover': {
            backgroundColor: theme.colors.blue[3],
        },
        '&:active': {
            backgroundColor: theme.colors.blue[4],
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
    onClick,
}) => {
    const { classes } = useStyles(null, {
        styles,
        classNames,
        name: 'SpotlightItem',
    });

    return (
        <Group
            role="menuitem"
            // TODO: add back in when we have keyboard navigation
            // data-hovered={hovered || undefined}
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
                <Text fw={500} size="sm" truncate>
                    {item.prefix} {item.title}
                </Text>

                {item.description || item.typeLabel ? (
                    <Text size="xs" truncate>
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
