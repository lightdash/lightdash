import { ActionIcon, Group, Tooltip } from '@mantine-8/core';
import { IconFilter, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import CompilationSourceFilter from './SourceFilter';
import { type CompilationSource } from './types';

type CompilationHistoryTopToolbarProps = {
    selectedSource: CompilationSource | null;
    setSelectedSource: (source: CompilationSource | null) => void;
    isFetching: boolean;
    currentResultsCount: number;
    hasActiveFilters: boolean;
    resetFilters: () => void;
};

export const CompilationHistoryTopToolbar: FC<
    CompilationHistoryTopToolbarProps
> = ({ selectedSource, setSelectedSource, hasActiveFilters, resetFilters }) => {
    return (
        <Group
            justify="space-between"
            px="sm"
            py="md"
            wrap="nowrap"
            style={(theme) => ({
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
            })}
        >
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconFilter} color="ldGray" />
                <CompilationSourceFilter
                    selectedSource={selectedSource}
                    setSelectedSource={setSelectedSource}
                />
            </Group>
            {hasActiveFilters && (
                <Tooltip label="Clear all filters">
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="gray"
                        onClick={resetFilters}
                        style={{ flexShrink: 0 }}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};
