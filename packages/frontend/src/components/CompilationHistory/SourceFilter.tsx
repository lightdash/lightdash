import {
    ActionIcon,
    Button,
    Group,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';
import classes from './SourceFilter.module.css';
import { ALL_SOURCES, getSourceLabel, type CompilationSource } from './types';

type CompilationSourceFilterProps = {
    selectedSource: CompilationSource | null;
    setSelectedSource: (source: CompilationSource | null) => void;
};

const CompilationSourceFilter: FC<CompilationSourceFilterProps> = ({
    selectedSource,
    setSelectedSource,
}) => {
    const { t } = useTranslation('projectConnection');
    const hasSelectedSource = selectedSource !== null;
    const buttonLabel = useMemo(
        () =>
            selectedSource
                ? getSourceLabel(t, selectedSource)
                : t('compilationHistory.source'),
        [selectedSource, t],
    );

    const handleSourceChange = (value: string) => {
        setSelectedSource(value as CompilationSource);
    };

    return (
        <Group gap={2} wrap="nowrap">
            <Popover width={250} position="bottom-start">
                <Popover.Target>
                    <Tooltip label={t('compilationHistory.filterTooltip')}>
                        <Button
                            h={32}
                            c="foreground"
                            fz="sm"
                            variant="default"
                            px="sm"
                            className={
                                hasSelectedSource
                                    ? `${classes.filterButton} ${classes.filterButtonSelected}`
                                    : classes.filterButton
                            }
                            classNames={{
                                label: classes.filterButtonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldDark.3" fw={600}>
                            {t('compilationHistory.filterBySource')}
                        </Text>

                        <ScrollArea.Autosize
                            mah={200}
                            type="always"
                            scrollbars="y"
                        >
                            <Radio.Group
                                value={selectedSource ?? ''}
                                onChange={handleSourceChange}
                            >
                                <Stack gap="xs">
                                    {ALL_SOURCES.map((source) => (
                                        <Radio
                                            key={source}
                                            value={source}
                                            label={getSourceLabel(t, source)}
                                            size="xs"
                                        />
                                    ))}
                                </Stack>
                            </Radio.Group>
                        </ScrollArea.Autosize>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedSource && (
                <Tooltip label={t('compilationHistory.clearFilter')}>
                    <ActionIcon
                        aria-label={t('compilationHistory.clearFilter')}
                        size="xs"
                        color="ldGray.5"
                        onClick={() => setSelectedSource(null)}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default CompilationSourceFilter;
