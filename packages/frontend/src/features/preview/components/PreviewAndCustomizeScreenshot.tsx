import { ApiError, Dashboard } from '@lightdash/common';
import {
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
import { IconEye, IconEyeClosed } from '@tabler/icons-react';
import { Dispatch, FC, SetStateAction, useState } from 'react';
import { UseMutationResult } from 'react-query';
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
        }
    >;
    previews: Record<string, string>;
    setPreviews: Dispatch<SetStateAction<Record<string, string>>>;
    previewChoice: typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined;
    setPreviewChoice: Dispatch<
        SetStateAction<typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined>
    >;
    onPreviewClick?: () => Promise<void>;
};

export const PreviewAndCustomizeScreenshot: FC<
    PreviewAndCustomizeScreenshotProps
> = ({
    containerWidth,
    exportMutation,
    previews,
    previewChoice,
    setPreviewChoice,
    onPreviewClick,
}) => {
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    return (
        <Box>
            <LoadingOverlay visible={exportMutation.isLoading} />

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
                                styles={{
                                    root: {
                                        objectPosition: 'top',
                                        cursor:
                                            previewChoice &&
                                            previews[previewChoice]
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
                        </Card>
                        <Button
                            mx="auto"
                            display="block"
                            size="xs"
                            variant="default"
                            leftIcon={<MantineIcon icon={IconEye} />}
                            disabled={!previewChoice}
                            onClick={onPreviewClick}
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
                    src={exportMutation.data}
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
