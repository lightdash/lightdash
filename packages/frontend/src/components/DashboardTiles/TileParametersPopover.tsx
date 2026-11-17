import {
    assertUnreachable,
    DashboardTileParameterSource,
    type UiStringResolver,
} from '@lightdash/common';
import { ActionIcon, Popover, Stack, Text } from '@mantine/core';
import { IconVariable } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import MantineIcon from '../common/MantineIcon';
import tileClasses from './DashboardTiles.module.css';
import { TileHeaderPopover } from './TileBase/TileHeaderPopover';
import { type TileParameterItem } from './tileParameterItems';

const getParameterSourceLabel = (
    source: DashboardTileParameterSource,
    getUiString: UiStringResolver,
): string => {
    switch (source) {
        case DashboardTileParameterSource.CHART:
            return getUiString('parameters.source.chart');
        case DashboardTileParameterSource.DASHBOARD:
            return getUiString('parameters.source.dashboard');
        case DashboardTileParameterSource.DEFAULT:
            return getUiString('parameters.source.default');
        default:
            return assertUnreachable(source, 'Unknown parameter source');
    }
};

/** The tile header's (x) icon: each parameter value the tile ran with, and where it came from. */
export const TileParametersPopover: FC<{ items: TileParameterItem[] }> = ({
    items,
}) => {
    const getUiString = useUiStrings();
    if (items.length === 0) return null;
    return (
        <TileHeaderPopover>
            <Popover.Dropdown
                maw="calc(100vw - 24px)"
                mah="calc(100dvh - 24px)"
                className={tileClasses.scrollableDropdown}
            >
                <Text c="dimmed" fw={500} mb="xs">
                    {getUiString('tile.parameters.title')}
                </Text>
                <Stack gap="xs" align="flex-start" ml="xs">
                    {items.map(({ key, label, value, source, sourceLabel }) => (
                        <Text key={key} size="xs" c="dimmed">
                            {sourceLabel !== null && `${sourceLabel} · `}
                            <Text span fw={600}>
                                {label}:
                            </Text>{' '}
                            {Array.isArray(value) ? value.join(', ') : value}{' '}
                            <Text span inherit fs="italic">
                                {`(${getParameterSourceLabel(source, getUiString)})`}
                            </Text>
                        </Text>
                    ))}
                </Stack>
            </Popover.Dropdown>
            <Popover.Target>
                <ActionIcon
                    aria-label={getUiString('tileMenu.parameters')}
                    size="sm"
                >
                    <MantineIcon icon={IconVariable} />
                </ActionIcon>
            </Popover.Target>
        </TileHeaderPopover>
    );
};
