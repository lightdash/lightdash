import {
    ActionIcon,
    Button,
    NumberInput,
    Popover,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { DEFAULT_SQL_LIMIT } from '../../constants';
import { useDownloadResults } from '../../hooks/useDownloadResults';

type Props = {
    fileUrl: string | undefined;
    columnNames: string[];
    chartName?: string;
};

export const ResultsDownloadFromUrl: FC<Props> = ({
    fileUrl,
    columnNames,
    chartName,
}) => {
    const [customLimit, setCustomLimit] = useState(DEFAULT_SQL_LIMIT);
    const { handleDownload, isLoading } = useDownloadResults({
        fileUrl,
        columnNames,
        chartName,
        customLimit:
            customLimit !== DEFAULT_SQL_LIMIT ? customLimit : undefined,
    });
    return (
        <Popover
            withArrow
            disabled={!fileUrl}
            closeOnClickOutside={!isLoading}
            closeOnEscape={!isLoading}
        >
            <Popover.Target>
                <Tooltip variant="xs" label="Download results as .csv">
                    <ActionIcon variant="default" disabled={!fileUrl}>
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack>
                    <NumberInput
                        size="xs"
                        type="number"
                        label="Row limit:"
                        step={100}
                        min={1}
                        autoFocus
                        required
                        defaultValue={DEFAULT_SQL_LIMIT}
                        onChange={(value: number) => setCustomLimit(value)}
                    />
                    <Button
                        size="xs"
                        ml="auto"
                        onClick={handleDownload}
                        loading={isLoading}
                    >
                        Download
                    </Button>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
