import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconFilter, IconFilterOff } from '@tabler/icons-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';
import {
    ExploreFilter,
    MissReasonFilter,
    PreAggregateFilter,
    QueryTypeFilter,
} from './PreAggregateFilters';
import type { QueryType } from './preAggregateHelpers';

type Props = {
    explores: string[];
    preAggregateNames: string[];
    missReasons: string[];
    selectedExplore: string | null;
    setSelectedExplore: (value: string | null) => void;
    selectedPreAggregate: string | null;
    setSelectedPreAggregate: (value: string | null) => void;
    selectedQueryType: QueryType | null;
    setSelectedQueryType: (value: QueryType | null) => void;
    selectedMissReason: string | null;
    setSelectedMissReason: (value: string | null) => void;
    hasActiveFilters: boolean;
    resetFilters: () => void;
};

const PreAggregateTopToolbar: FC<Props> = ({
    explores,
    preAggregateNames,
    missReasons,
    selectedExplore,
    setSelectedExplore,
    selectedPreAggregate,
    setSelectedPreAggregate,
    selectedQueryType,
    setSelectedQueryType,
    selectedMissReason,
    setSelectedMissReason,
    hasActiveFilters,
    resetFilters,
}) => {
    const { t } = useTranslation('app');
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
                <ExploreFilter
                    explores={explores}
                    selected={selectedExplore}
                    onChange={setSelectedExplore}
                />
                <PreAggregateFilter
                    names={preAggregateNames}
                    selected={selectedPreAggregate}
                    onChange={setSelectedPreAggregate}
                />
                <QueryTypeFilter
                    selected={selectedQueryType}
                    onChange={setSelectedQueryType}
                />
                <MissReasonFilter
                    reasons={missReasons}
                    selected={selectedMissReason}
                    onChange={setSelectedMissReason}
                />
            </Group>
            {hasActiveFilters && (
                <Tooltip label={t('preAggregateAudit.resetFilters')}>
                    <ActionIcon
                        size="sm"
                        onClick={resetFilters}
                        flex="0 0 auto"
                    >
                        <MantineIcon icon={IconFilterOff} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default PreAggregateTopToolbar;
