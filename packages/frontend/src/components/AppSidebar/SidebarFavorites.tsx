import { getResourceViewItemName } from '@lightdash/common';
import { Box, NavLink, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';
import {
    getFavoriteItemIcon,
    getFavoriteItemUrl,
} from '../NavBar/favoriteItems';
import classes from './AppSidebar.module.css';
import { SidebarSection } from './SidebarSection';

type FavoriteProps = {
    name: string;
    to: string;
    icon: ReturnType<typeof getFavoriteItemIcon>;
    isActive: boolean;
};

const SidebarFavorite: FC<FavoriteProps> = ({ name, to, icon, isActive }) => {
    const { ref, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Tooltip label={name} position="right" disabled={!isTruncated}>
            <NavLink
                component={Link}
                to={to}
                label={
                    <Text ref={ref} inherit truncate>
                        {name}
                    </Text>
                }
                leftSection={<MantineIcon icon={icon} />}
                active={isActive}
                aria-current={isActive ? 'page' : undefined}
                classNames={{
                    root: classes.item,
                    label: classes.itemLabel,
                    section: classes.itemSection,
                }}
            />
        </Tooltip>
    );
};

type Props = {
    projectUuid: string;
    projectUrlIdentifier: string;
    isSidebarCollapsed: boolean;
    activeFavoriteUuid: string | null;
};

export const SidebarFavorites: FC<Props> = ({
    projectUuid,
    projectUrlIdentifier,
    isSidebarCollapsed,
    activeFavoriteUuid,
}) => {
    const { data: favorites } = useFavorites(projectUuid);
    if (!favorites || favorites.length === 0) return null;

    return (
        <Box className={classes.favorites}>
            <SidebarSection
                sectionKey="favorites"
                label="Favorites"
                isSidebarCollapsed={isSidebarCollapsed}
                items={favorites.map((item) => ({
                    key: item.data.uuid,
                    isActive: item.data.uuid === activeFavoriteUuid,
                    element: (
                        <SidebarFavorite
                            name={getResourceViewItemName(item)}
                            to={getFavoriteItemUrl(
                                projectUuid,
                                projectUrlIdentifier,
                                item,
                            )}
                            icon={getFavoriteItemIcon(item)}
                            isActive={item.data.uuid === activeFavoriteUuid}
                        />
                    ),
                }))}
            />
        </Box>
    );
};
