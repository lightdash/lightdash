import {
    getResourceViewItemName,
    type ResourceViewItem,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { useRef, type FC } from 'react';
import { Link } from 'react-router';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import MantineIcon from '../common/MantineIcon';
import {
    getFavoriteItemIcon,
    getFavoriteItemUrl,
} from '../NavBar/favoriteItems';
import classes from './AppSidebar.module.css';
import { SidebarNavLink } from './SidebarNavLink';
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
        <SidebarNavLink
            component={Link}
            to={to}
            tooltip={name}
            isTooltipShown={isTruncated}
            isActive={isActive}
            label={
                <Text ref={ref} inherit truncate>
                    {name}
                </Text>
            }
            leftSection={<MantineIcon icon={icon} />}
        />
    );
};

type Props = {
    favorites: ResourceViewItem[] | undefined;
    projectUuid: string;
    projectUrlIdentifier: string;
    isSidebarCollapsed: boolean;
    activeFavoriteUuid: string | null;
};

export const SidebarFavorites: FC<Props> = ({
    favorites,
    projectUuid,
    projectUrlIdentifier,
    isSidebarCollapsed,
    activeFavoriteUuid,
}) => {
    // Favorites already there when the list first loads just appear; only
    // the ones starred afterwards open into place.
    const initialFavorites = useRef<Set<string> | null>(null);
    if (favorites && initialFavorites.current === null) {
        initialFavorites.current = new Set(
            favorites.map((item) => item.data.uuid),
        );
    }
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
                    animatesIn:
                        initialFavorites.current?.has(item.data.uuid) === false,
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
