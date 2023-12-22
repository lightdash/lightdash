import { Dashboard } from '@lightdash/common';
import {
    Button,
    Center,
    Divider,
    Flex,
    Group,
    Image,
    LoadingOverlay,
    Modal,
    Select,
    Skeleton,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconEye,
    IconEyeClosed,
    IconEyeCog,
    IconFileExport,
} from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';
import CollapsableCard from '../CollapsableCard';
import MantineIcon from '../MantineIcon';

type Props = {
    gridWidth: number;
    dashboard: Dashboard;
};

const CUSTOM_WIDTH_OPTIONS = [
    {
        label: 'Small (1000px)',
        value: '1000',
    },
    {
        label: 'Medium (1200px)',
        value: '1200',
    },
    {
        label: 'Large (1400px)',
        value: '1400',
    },
];

const PreviewAndCustomize: FC<Props> = ({ gridWidth, dashboard }) => {
    const [isOpenImage, setIsOpenImage] = useState(false);
    const location = useLocation();
    const { mutate: exportDashboard, isLoading, data } = useExportDashboard();
    const [previewChoice, setPreviewChoice] = useState('current');
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

    return (
        <>
            <CollapsableCard
                isOpen={isCustomizeOpen}
                title="Customize"
                headerElement={
                    <Text fz="xs" c="gray.6">
                        your dashboard before exporting (with preview)
                    </Text>
                }
                onToggle={() => {
                    setIsCustomizeOpen(!isCustomizeOpen);
                }}
            >
                <Stack spacing="lg" p="md">
                    <Group position="center" align="flex-end">
                        <Select
                            label="Use custom width"
                            withinPortal
                            data={CUSTOM_WIDTH_OPTIONS.concat([
                                {
                                    label: `Current view: ${gridWidth}px`,
                                    value: 'current',
                                },
                            ])}
                            defaultValue="current"
                            onChange={(value) => {
                                if (!value) return;
                                setPreviewChoice(value);
                            }}
                        />

                        <Button
                            variant="default"
                            leftIcon={<MantineIcon icon={IconEye} />}
                            onClick={() => {
                                exportDashboard({
                                    dashboard,
                                    gridWidth:
                                        previewChoice === 'current'
                                            ? gridWidth
                                            : parseInt(previewChoice),
                                    queryFilters: location.search,
                                    isPreview: true,
                                });
                            }}
                        >
                            Generate preview
                        </Button>
                    </Group>

                    <Center h={400}>
                        <LoadingOverlay visible={isLoading} />
                        <Image
                            src={data}
                            onClick={() => {
                                if (data) setIsOpenImage(true);
                            }}
                            width={400}
                            height={400}
                            style={{
                                objectPosition: 'top',
                                cursor: data ? 'pointer' : 'default',
                            }}
                            withPlaceholder
                            placeholder={
                                isLoading ? (
                                    <Skeleton w={400} h={400} />
                                ) : (
                                    <Flex
                                        gap="md"
                                        align="center"
                                        direction="column"
                                    >
                                        <MantineIcon
                                            icon={IconEyeClosed}
                                            size={30}
                                        />

                                        <Text>No preview yet</Text>
                                    </Flex>
                                )
                            }
                        />
                    </Center>
                    <Button
                        m="auto"
                        leftIcon={<MantineIcon icon={IconEyeCog} />}
                        onClick={() => {
                            exportDashboard({
                                dashboard,
                                gridWidth:
                                    previewChoice === 'current'
                                        ? gridWidth
                                        : parseInt(previewChoice),
                                queryFilters: location.search,
                            });
                        }}
                    >
                        Export with current selection
                    </Button>
                </Stack>
            </CollapsableCard>

            <Modal
                fullScreen
                onClose={() => setIsOpenImage(false)}
                opened={isOpenImage}
            >
                <Image
                    src={data}
                    onClick={() => {
                        setIsOpenImage(false);
                    }}
                    width="100%"
                    height="100%"
                    style={{
                        cursor: 'pointer',
                    }}
                />
            </Modal>
        </>
    );
};

export const DashboardExportModal: FC<Props> = ({ gridWidth, dashboard }) => {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(true);
    const { mutate: exportDashboard, isLoading } = useExportDashboard();

    return (
        <>
            <Modal
                size="xl"
                yOffset="3vh"
                opened={isOpen}
                onClose={() => {
                    setIsOpen(false);
                }}
                title={<Title order={5}>Export dashboard</Title>}
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <Stack>
                    <Button
                        loading={isLoading}
                        m="auto"
                        onClick={() => {
                            exportDashboard({
                                dashboard,
                                gridWidth: undefined,
                                queryFilters: location.search,
                            });
                        }}
                        leftIcon={<MantineIcon icon={IconFileExport} />}
                    >
                        Export now
                    </Button>

                    <Divider label="OR" labelPosition="center" />

                    <PreviewAndCustomize
                        gridWidth={gridWidth}
                        dashboard={dashboard}
                    />

                    <Group position="left" pb="md" px="md">
                        <Button
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                        >
                            Cancel
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
