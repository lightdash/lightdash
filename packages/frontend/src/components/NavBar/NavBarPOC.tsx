import {
    ActionIcon,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Header,
    MantineProvider,
    Text,
    Tooltip,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { NAVBAR_HEIGHT } from '.';
import { useCatalogContext } from '../../features/catalog/context/CatalogProvider';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import Logo from '../../svgs/logo-icon.svg?react';

export const NavBarPOC = () => {
    const { selectedTable, setIsViewingCatalog, isViewingCatalog } =
        useCatalogContext();
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
    });
    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';
    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            {/* hack to make navbar fixed and maintain space */}
            <Box h={NAVBAR_HEIGHT} />
            <Header
                height={NAVBAR_HEIGHT - 6}
                fixed
                zIndex={getDefaultZIndex('app')}
                styles={() => ({
                    root: {
                        alignItems: 'center',
                        boxShadow: 'lg',
                        justifyContent: 'flex-start',
                    },
                })}
                pt="xs"
                px="xs"
            >
                <Group>
                    <ActionIcon
                        component={Link}
                        to={homeUrl}
                        title="Home"
                        size="lg"
                    >
                        <Logo />
                    </ActionIcon>

                    <Button
                        sx={(theme) => ({
                            ...(isViewingCatalog
                                ? {
                                      border: `1px solid ${theme.colors.gray[2]}`,
                                      borderBottom: 'none',
                                      borderBottomLeftRadius: 0,
                                      borderBottomRightRadius: 0,
                                  }
                                : {}),
                        })}
                        onClick={() => setIsViewingCatalog(true)}
                        variant={isViewingCatalog ? 'white' : 'subtle'}
                        c={isViewingCatalog ? 'gray.8' : 'gray.2'}
                        fw={600}
                        fz="lg"
                    >
                        Catalog
                    </Button>

                    {selectedTable && (
                        <Text c="gray.2" fw={600} fz="lg">
                            /{' '}
                        </Text>
                    )}

                    <Tooltip label="Start exploring" position="right">
                        <Button
                            sx={(theme) => ({
                                ...(!isViewingCatalog
                                    ? {
                                          border: `1px solid ${theme.colors.gray[2]}`,
                                          borderBottom: 'none',
                                          borderBottomLeftRadius: 0,
                                          borderBottomRightRadius: 0,
                                      }
                                    : {}),
                            })}
                            onClick={() => setIsViewingCatalog(false)}
                            variant={!isViewingCatalog ? 'white' : 'subtle'}
                            c={!isViewingCatalog ? 'gray.8' : 'gray.2'}
                            fw={600}
                            fz="lg"
                        >
                            {!selectedTable ? '+' : 'Explore'}
                        </Button>
                    </Tooltip>
                </Group>
            </Header>
        </MantineProvider>
    );
};
