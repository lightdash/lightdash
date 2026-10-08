import { interpolateUiString, type CatalogField } from '@lightdash/common';
import {
    Box,
    CloseButton,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';
import { type ContentTableRow } from '../../../components/common/ContentTable';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useCanHover } from '../../../hooks/useCanHover';
import classes from './MetricsCatalogColumnOwner.module.css';

type Props = {
    row: ContentTableRow<CatalogField>;
};

export const MetricsCatalogColumnOwner: FC<Props> = ({ row }) => {
    const owner = row.original.owner;
    const [opened, setOpened] = useState(false);
    const canHover = useCanHover();
    const getUiString = useUiStrings();

    if (!owner) {
        return (
            <Text
                fz="sm"
                c="ldGray.5"
                fs="italic"
                style={{ cursor: 'default' }}
            >
                Unassigned
            </Text>
        );
    }

    const displayName = `${owner.firstName} ${owner.lastName}`;

    const ownerLabel = (
        <Group gap="two" wrap="nowrap" maw="200px">
            <LightdashUserAvatar
                size={16}
                name={displayName}
                userUuid={owner.userUuid}
            />
            <Text fz="sm" fw={600} truncate>
                {displayName}
            </Text>
        </Group>
    );

    if (canHover) {
        return (
            <Tooltip label={owner.email} openDelay={300}>
                <Box px="xs" className={classes.hoverTrigger}>
                    {ownerLabel}
                </Box>
            </Tooltip>
        );
    }

    return (
        <Popover
            opened={opened}
            onDismiss={() => setOpened(false)}
            position="bottom-end"
            floatingStrategy="fixed"
            middlewares={{ shift: { crossAxis: true, padding: 12 } }}
            width="min(320px, calc(100vw - 24px))"
            trapFocus
            returnFocus
        >
            <Popover.Target>
                <UnstyledButton
                    px="xs"
                    className={classes.trigger}
                    aria-label={interpolateUiString(
                        getUiString('metrics.ownerDetails'),
                        { owner: displayName },
                    )}
                    onClick={() => setOpened((value) => !value)}
                >
                    {ownerLabel}
                </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown className={classes.dropdown}>
                <Stack gap="xs">
                    <Group wrap="nowrap" justify="space-between">
                        <Text fw={600} size="sm">
                            {displayName}
                        </Text>
                        <CloseButton
                            mod="touch-dismiss"
                            aria-label={getUiString('page.closeDetails')}
                            onClick={() => setOpened(false)}
                        />
                    </Group>
                    <Text size="sm" className={classes.email}>
                        {owner.email}
                    </Text>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
