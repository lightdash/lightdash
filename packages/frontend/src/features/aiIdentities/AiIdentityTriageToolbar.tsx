import {
    AiIdentitySort,
    AiIdentityState,
    type AiIdentityFilter,
    type AiIdentityListResult,
    type OrganizationProject,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    MultiSelect,
    Select,
    Text,
    Stack,
} from '@mantine/core';
import { type FC } from 'react';
import {
    ContentTableSearchInput,
    SelectAllMatching,
} from '../../components/common/ContentTable';

type Props = {
    filter: AiIdentityFilter;
    sort: AiIdentitySort;
    result: AiIdentityListResult | undefined;
    projects: OrganizationProject[] | undefined;
    searchInput: string;
    onSearchInput: (value: string) => void;
    selectedCount: number;
    allMatching: boolean;
    effectiveFilter: AiIdentityFilter;
    onSelectAll: () => void;
    onClear: () => void;
    onParam: (key: string, value: string | null) => void;
    onMultiParam: (key: string, values: string[]) => void;
    onJob: (
        kind: 'test' | 'export',
        filter: AiIdentityFilter,
        format?: 'json' | 'sql' | 'csv',
    ) => Promise<void>;
};

const stateLabels: Record<AiIdentityState, string> = {
    [AiIdentityState.READY]: 'Ready',
    [AiIdentityState.PENDING]: 'Pending',
    [AiIdentityState.FAILED]: 'Failed',
    [AiIdentityState.NEEDS_SIGN_IN]: 'Needs sign-in',
};

export const AiIdentityTriageToolbar: FC<Props> = ({
    filter,
    sort,
    result,
    projects,
    searchInput,
    onSearchInput,
    selectedCount,
    allMatching,
    effectiveFilter,
    onSelectAll,
    onClear,
    onParam,
    onMultiParam,
    onJob,
}) => {
    return (
        <Stack gap="xs">
            <Group gap="xs" wrap="wrap">
                <ContentTableSearchInput
                    value={searchInput}
                    onChange={onSearchInput}
                    placeholder="Search name, email, login, identity"
                />
                <MultiSelect
                    size="xs"
                    placeholder="Status"
                    aria-label="Status"
                    data={Object.values(AiIdentityState).map((state) => ({
                        value: state,
                        label: stateLabels[state],
                    }))}
                    value={filter.states}
                    onChange={(values) => onMultiParam('state', values)}
                />
                <MultiSelect
                    size="xs"
                    placeholder="Cause"
                    aria-label="Cause"
                    data={result?.failureGroups.map((group) => ({
                        value: group.reason,
                        label: group.title,
                    }))}
                    value={filter.reasons}
                    onChange={(values) => onMultiParam('reason', values)}
                />
                <Select
                    size="xs"
                    placeholder="Project"
                    aria-label="Project"
                    clearable
                    data={projects?.map((project) => ({
                        value: project.projectUuid,
                        label: project.name,
                    }))}
                    value={filter.projectUuid}
                    onChange={(value) => onParam('project', value)}
                />
                <Checkbox
                    label="Stale only"
                    checked={filter.staleOnly}
                    onChange={(event) =>
                        onParam(
                            'stale',
                            event.currentTarget.checked ? 'true' : null,
                        )
                    }
                />
                <Select
                    size="xs"
                    aria-label="Sort"
                    leftSection={
                        <Text fz="xs" c="dimmed">
                            Sort
                        </Text>
                    }
                    leftSectionWidth={40}
                    data={[
                        {
                            value: AiIdentitySort.SEVERITY,
                            label: 'Most urgent first',
                        },
                        {
                            value: AiIdentitySort.LAST_CHECKED,
                            label: 'Last checked',
                        },
                        { value: AiIdentitySort.NAME, label: 'Name' },
                    ]}
                    value={sort}
                    onChange={(value) => onParam('sort', value)}
                />
            </Group>
            {selectedCount > 0 && (
                <Group gap="xs" wrap="wrap">
                    <SelectAllMatching
                        selectedCount={selectedCount}
                        matchingCount={result?.pagination.totalResults ?? 0}
                        allMatching={allMatching}
                        onSelectAll={onSelectAll}
                        onClear={onClear}
                    />
                    <Button
                        size="xs"
                        variant="default"
                        onClick={() => void onJob('test', effectiveFilter)}
                    >
                        Re-test selected
                    </Button>
                </Group>
            )}
        </Stack>
    );
};
