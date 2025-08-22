import { type ApiError, type Dashboard } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Card,
    Flex,
    Image,
    LoadingOverlay,
    Modal,
    Radio,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconArrowsDiagonal,
    IconEye,
    IconEyeClosed,
} from '@tabler/icons-react';
import { type UseMutationResult } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { CUSTOM_WIDTH_OPTIONS } from '../../scheduler/constants';

type PreviewAndCustomizeScreenshotProps = {
    containerWidth?: number | undefined;
    exportMutation: UseMutationResult<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            gridWidth: number | undefined;
            queryFilters: string;
            isPreview?: boolean | undefined;
            selectedTabs: string[] | null;
        }
    >;
    previewChoice: typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined;
    setPreviewChoice: (
        prev: typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined,
    ) => void;
    onPreviewClick?: () => Promise<void>;
    currentPreview?: string;
    disabled?: boolean;
};

export const PreviewAndCustomizeScreenshot: FC<
    PreviewAndCustomizeScreenshotProps
> = ({
    containerWidth,
    exportMutation,
    previewChoice,
    setPreviewChoice,
    onPreviewClick,
    currentPreview,
    disabled = false,
}) => {
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    return (
        <Box>
            <LoadingOverlay visible={exportMutation.isLoading} />

            <Stack spacing="md">
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
                            {CUSTOM_WIDTH_OPTIONS.concat(
                                containerWidth
                                    ? [
                                          {
                                              label: `Current view (${containerWidth}px)`,
                                              value: containerWidth.toString(),
                                          },
                                      ]
                                    : [],
                            ).map((option) => (
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
                            <Box pos="relative">
                                <Image
                                    src={currentPreview}
                                    onClick={() => {
                                        if (currentPreview)
                                            setIsImageModalOpen(true);
                                    }}
                                    width={350}
                                    height={350}
                                    styles={{
                                        root: {
                                            objectPosition: 'top',
                                            cursor: currentPreview
                                                ? 'pointer'
                                                : 'default',
                                        },
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
                                {currentPreview && (
                                    <ActionIcon
                                        pos="absolute"
                                        top={5}
                                        right={5}
                                        variant="light"
                                        color="blue"
                                        size="sm"
                                        onClick={() => {
                                            if (currentPreview)
                                                setIsImageModalOpen(true);
                                        }}
                                    >
                                        <MantineIcon
                                            icon={IconArrowsDiagonal}
                                        />
                                    </ActionIcon>
                                )}
                            </Box>
                        </Card>
                        <Button
                            mx="auto"
                            display="block"
                            size="xs"
                            variant="default"
                            leftIcon={<MantineIcon icon={IconEye} />}
                            disabled={!previewChoice || disabled}
                            onClick={async () => {
                                if (onPreviewClick) {
                                    await onPreviewClick();
                                }
                            }}
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
                    src={currentPreview}
                    onClick={() => {
                        setIsImageModalOpen(false);
                    }}
                    width="100%"
                    height="100%"
                    styles={{
                        root: {
                            cursor: 'pointer',
                        },
                    }}
                />
            </Modal>
        </Box>
    );
};
