import {
    applyDimensionOverrides,
    Dashboard,
    SchedulerFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Card,
    Flex,
    Group,
    Image,
    LoadingOverlay,
    Modal,
    Radio,
    Stack,
    Text,
} from '@mantine/core';
import { IconCheck, IconEye, IconEyeClosed } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExportDashboard } from '../../../hooks/dashboard/useDashboard';

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

type Props = {
    dashboard: Dashboard;
    schedulerFilters: SchedulerFilterRule[] | undefined;
    onChange: (
        previewChoice: typeof CUSTOM_WIDTH_OPTIONS[number]['value'],
    ) => void;
};

export const SchedulerPreview: FC<Props> = ({
    dashboard,
    schedulerFilters,
    onChange,
}) => {
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        typeof CUSTOM_WIDTH_OPTIONS[number]['value']
    >(CUSTOM_WIDTH_OPTIONS[0].value);
    const exportDashboardMutation = useExportDashboard();

    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const getSchedulerFilterOverridesQueryString = useCallback(() => {
        if (schedulerFilters) {
            const overriddenDimensions = applyDimensionOverrides(
                dashboard.filters,
                schedulerFilters,
            );

            const filtersParam = encodeURIComponent(
                JSON.stringify({
                    dimensions: overriddenDimensions,
                    metrics: [],
                    tableCalculations: [],
                }),
            );
            return `?filters=${filtersParam}`;
        }
        return '';
    }, [dashboard.filters, schedulerFilters]);

    const handlePreviewClick = useCallback(async () => {
        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: getSchedulerFilterOverridesQueryString(),
            isPreview: true,
        });

        setPreviews((prev) => ({
            ...prev,
            ...(previewChoice ? { [previewChoice]: url } : {}),
        }));
    }, [
        dashboard,
        exportDashboardMutation,
        previewChoice,
        getSchedulerFilterOverridesQueryString,
    ]);

    return (
        <Box>
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
                            {CUSTOM_WIDTH_OPTIONS.map((option) => (
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
                        <Group>
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
                            <Button
                                mx="auto"
                                display="block"
                                size="xs"
                                variant="default"
                                leftIcon={<MantineIcon icon={IconCheck} />}
                                disabled={!previewChoice}
                                onClick={() => onChange(previewChoice)}
                            >
                                Set this size
                            </Button>
                        </Group>
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
