import { DownloadFileType } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    NumberInput,
    Popover,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props2 = {
    isDownloading: boolean;
    onDownload: (args: {
        limit?: number | null;
        type?: DownloadFileType;
    }) => void;
    defaultQueryLimit?: number;
};

export const ResultsDownload: FC<Props2> = ({
    isDownloading,
    onDownload,
    defaultQueryLimit,
}) => {
    const [customLimit, setCustomLimit] = useState(defaultQueryLimit);
    const [fileType, setFileType] = useState<DownloadFileType>(
        DownloadFileType.CSV,
    );

    return (
        <Popover
            withArrow
            closeOnClickOutside={!isDownloading}
            closeOnEscape={!isDownloading}
        >
            <Popover.Target>
                <Tooltip variant="xs" label="Download results">
                    <ActionIcon variant="default">
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack>
                    <SegmentedControl
                        size="xs"
                        value={fileType}
                        onChange={(value) =>
                            setFileType(value as DownloadFileType)
                        }
                        data={[
                            { label: 'CSV', value: DownloadFileType.CSV },
                            { label: 'Excel', value: DownloadFileType.XLSX },
                        ]}
                    />
                    <NumberInput
                        size="xs"
                        type="number"
                        label="Row limit:"
                        step={100}
                        min={1}
                        autoFocus
                        required
                        defaultValue={customLimit}
                        onChange={(value: number) => setCustomLimit(value)}
                    />
                    <Button
                        size="xs"
                        ml="auto"
                        onClick={() =>
                            onDownload({ limit: customLimit, type: fileType })
                        }
                        loading={isDownloading}
                    >
                        Download
                    </Button>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
