import {
    ActionIcon,
    Box,
    Center,
    CloseButton,
    Group,
    Modal,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowDownBar,
    IconArrowUpBar,
    IconMaximize,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { CatalogPanel } from '../features/catalog/components';
import { CatalogMetadata } from '../features/catalog/components/CatalogMetadata';
import {
    CatalogProvider,
    useCatalogContext,
} from '../features/catalog/context/CatalogProvider';
import Explorer from './Explorer';

const ExploreModal: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const history = useHistory();
    const [isModalOpened, setModalOpened] = useState(false);
    const [isModalMinimized, setModalMinimized] = useState(false);
    const [isModalMaximized, setModalMaximized] = useState(false);
    const { selectedTable, setSelectedTable } = useCatalogContext();

    return (
        <Modal
            opened={isModalOpened || !!selectedTable}
            fullScreen={isModalMaximized}
            onClose={() => {
                setModalOpened(false);
                setSelectedTable(undefined);
                setModalMinimized(false);
                setModalMaximized(false);
                history.push(`/projects/${projectUuid}/tables`);
            }}
            withOverlay={false}
            size="auto"
            withCloseButton={false}
            styles={{
                inner: {
                    ...(!isModalMaximized
                        ? {
                              padding: `10px !important`,
                              paddingTop: `48px !important`,
                              paddingBottom: `100px !important`,
                              top: isModalMinimized ? `calc(100vh - 80px)` : 0,
                          }
                        : {}),
                },
                header: {
                    position: 'absolute',
                    right: 0,
                    padding: 0,
                    backgroundColor: 'transparent',
                },
                content: {
                    overflowY: 'hidden',
                    border: '1px solid #d8d8d8',
                    boxShadow: 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
                    ...(!isModalMaximized
                        ? {
                              height: 'calc(100dvh - (0.5rem * 2))',
                              width: 'calc(100dvw - (0.25rem * 2))',
                              maxHeight: 'calc(100vh - 75px) !important',
                              maxWidth: 'calc(100vw - 50px) !important',
                          }
                        : {}),
                },
                body: {
                    padding: 0,
                },
            }}
        >
            <Center
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    backgroundColor: theme.colors.gray[8],
                })}
                py="xs"
                pos={'relative'}
            >
                <Box fw={600} c="gray.2">
                    Query builder
                </Box>

                <Group pos="absolute" right={10} top={8} spacing="md">
                    <Group spacing="xs">
                        <Tooltip variant="xs" label="Minimize - Explore mode">
                            <ActionIcon
                                variant="default"
                                size="xs"
                                onClick={() => {
                                    setModalMaximized(false);
                                    setModalMinimized(!isModalMinimized);
                                }}
                            >
                                <MantineIcon
                                    color="gray.9"
                                    icon={
                                        isModalMinimized
                                            ? IconArrowUpBar
                                            : IconArrowDownBar
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip variant="xs" label="Maximize - Zen mode">
                            <ActionIcon
                                size="xs"
                                variant="default"
                                onClick={() => {
                                    setModalMinimized(false);
                                    setModalMaximized(!isModalMaximized);
                                }}
                            >
                                <MantineIcon
                                    color="gray.9"
                                    icon={IconMaximize}
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <CloseButton
                        variant="default"
                        size="xs"
                        c="gray.7"
                        onClick={() => {
                            setModalOpened(false);
                            setSelectedTable(undefined);
                            setModalMinimized(false);
                            setModalMaximized(false);
                            history.push(`/projects/${projectUuid}/tables`);
                        }}
                    />
                </Group>
            </Center>
            <Box p="xs">
                <Explorer />
            </Box>
        </Modal>
    );
};

const Catalog: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <CatalogProvider
            projectUuid={selectedProjectUuid}
            isSidebarOpen={isSidebarOpen}
            setSidebarOpen={setSidebarOpen}
        >
            <Page
                withFitContent
                withPaddedContent
                withRightSidebar
                isRightSidebarOpen={isSidebarOpen}
                rightSidebar={<CatalogMetadata />}
                rightSidebarWidthProps={{
                    defaultWidth: 600,
                    minWidth: 600,
                    maxWidth: 800,
                }}
            >
                <Box
                    sx={
                        isSidebarOpen
                            ? {
                                  overflowY: 'scroll',
                                  maxHeight: 'calc(100vh - 100px)',
                              }
                            : {}
                    }
                >
                    <CatalogPanel />
                </Box>
            </Page>
            <ExploreModal projectUuid={selectedProjectUuid} />
        </CatalogProvider>
    );
};

export default Catalog;
