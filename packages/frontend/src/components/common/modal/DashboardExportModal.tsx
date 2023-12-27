import { ApiError, Dashboard } from '@lightdash/common';
import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Image,
    LoadingOverlay,
    Modal,
    ModalProps,
    Radio,
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
import { Dispatch, FC, SetStateAction, useCallback, useState } from 'react';
import { UseMutationResult } from 'react-query';
import { useLocation } from 'react-router-dom';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';
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
        label: 'Medium (1400px)',
        value: '1400',
    },
    {
        label: 'Large (1500px)',
        value: '1500',
    },
];

type PreviewAndCustomizeProps = Props & {
    exportDashboardMutation: UseMutationResult<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            gridWidth: number | undefined;
            queryFilters: string;
            isPreview?: boolean | undefined;
        }
    >;
    previews: Record<string, string>;
    setPreviews: Dispatch<SetStateAction<Record<string, string>>>;
    previewChoice: string;
    setPreviewChoice: Dispatch<SetStateAction<string>>;
};

const PreviewAndCustomize: FC<PreviewAndCustomizeProps> = ({
    gridWidth,
    dashboard,
    exportDashboardMutation,
    previews,
    setPreviews,
    previewChoice,
    setPreviewChoice,
}) => {
    const location = useLocation();
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const handlePreviewClick = useCallback(async () => {
        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: location.search,
            isPreview: true,
        });
        setPreviews((prev) => ({
            ...prev,
            ...(previewChoice ? { [previewChoice]: url } : {}),
        }));
    }, [
        dashboard,
        exportDashboardMutation,
        location.search,
        previewChoice,
        setPreviews,
    ]);

    return (
        <Box p="md">
            <LoadingOverlay visible={exportDashboardMutation.isLoading} />

            <Stack spacing="md" px="md" py="md">
                <Flex align="flex-start" justify="space-between">
                    <Radio.Group
                        name="customWidth"
                        label="Custom width configuration"
                        defaultValue=""
                        onChange={(value) => {
                            setPreviewChoice(value);
                        }}
                        value={previewChoice}
                    >
                        <Flex direction="column" gap="sm" pt="sm">
                            {CUSTOM_WIDTH_OPTIONS.concat([
                                {
                                    label: `Current view (${gridWidth}px)`,
                                    value: gridWidth.toString(),
                                },
                            ]).map((option) => (
                                <Radio
                                    key={option.value}
                                    value={option.value}
                                    label={option.label}
                                    checked={previewChoice === option.value}
                                />
                            ))}
                        </Flex>
                    </Radio.Group>

                    <Stack>
                        <Card withBorder p={0}>
                            <Image
                                src={previewChoice && previews[previewChoice]}
                                onClick={() => {
                                    if (
                                        previewChoice &&
                                        previews[previewChoice]
                                    )
                                        setIsImageModalOpen(true);
                                }}
                                width={400}
                                height={400}
                                style={{
                                    objectPosition: 'top',
                                    cursor:
                                        previewChoice && previews[previewChoice]
                                            ? 'pointer'
                                            : 'default',
                                }}
                                withPlaceholder
                                placeholder={
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
                                }
                            />
                        </Card>
                        <Button
                            mx="auto"
                            display="block"
                            size="xs"
                            variant="default"
                            leftIcon={<MantineIcon icon={IconEye} />}
                            disabled={!previewChoice}
                            onClick={handlePreviewClick}
                        >
                            Generate preview
                        </Button>
                    </Stack>
                </Flex>
            </Stack>

            <Modal
                fullScreen
                onClose={() => setIsImageModalOpen(false)}
                opened={isImageModalOpen}
            >
                <Image
                    src={exportDashboardMutation.data}
                    onClick={() => {
                        setIsImageModalOpen(false);
                    }}
                    width="100%"
                    height="100%"
                    style={{
                        cursor: 'pointer',
                    }}
                />
            </Modal>
        </Box>
    );
};

export const DashboardExportModal: FC<Props & ModalProps> = ({
    opened,
    onClose,
    gridWidth,
    dashboard,
}) => {
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<string>('1400');
    const location = useLocation();
    const exportDashboardMutation = useExportDashboard();

    const handleExportClick = useCallback(() => {
        if (previewChoice && previews[previewChoice])
            return window.open(exportDashboardMutation.data, '_blank');

        exportDashboardMutation.mutate({
            dashboard,
            gridWidth: undefined,
            queryFilters: location.search,
        });
    }, [
        dashboard,
        exportDashboardMutation,
        location.search,
        previewChoice,
        previews,
    ]);

    return (
        <>
            <Modal
                size="xl"
                yOffset="3vh"
                opened={opened}
                onClose={onClose}
                title={<Title order={5}>Export dashboard</Title>}
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <Stack>
                    <PreviewAndCustomize
                        gridWidth={gridWidth}
                        dashboard={dashboard}
                        exportDashboardMutation={exportDashboardMutation}
                        previews={previews}
                        setPreviews={setPreviews}
                        previewChoice={previewChoice}
                        setPreviewChoice={setPreviewChoice}
                    />

                    <Group position="right" pb="md" px="md" spacing="lg">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>

                        <Group spacing="xs">
                            <Button
                                loading={exportDashboardMutation.isLoading}
                                onClick={handleExportClick}
                                leftIcon={
                                    <MantineIcon
                                        icon={
                                            previewChoice
                                                ? IconEyeCog
                                                : IconFileExport
                                        }
                                    />
                                }
                            >
                                Export dashboard
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
