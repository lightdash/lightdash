import {
    isChartValidationError,
    isFixableDashboardValidationError,
    ValidationErrorType,
    ValidationSourceType,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
    type ValidationErrorGroup,
} from '@lightdash/common';
import { Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useSearchParams from '../../hooks/useSearchParams';
import {
    useAllValidations,
    usePaginatedValidation,
    usePinnedValidation,
    useValidationMutation,
    useValidationSummary,
} from '../../hooks/validation/useValidation';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
import { BulkDeleteContentModal } from './BulkDeleteContentModal';
import {
    dedupeContentItems,
    getDeletableContentItem,
    type ValidationContentItem,
} from './utils/deletableContent';
import { ValidationSummarySection } from './ValidationSummarySection';
import { ValidatorTable } from './ValidatorTable';
import { ChartConfigurationErrorModal } from './ValidatorTable/ChartConfigurationErrorModal';
import { FixDashboardFilterModal } from './ValidatorTable/FixDashboardFilterModal';
import { FixValidationErrorModal } from './ValidatorTable/FixValidationErrorModal';

export const SettingsValidator: FC<{
    projectUuid: string;
    flush?: boolean;
}> = ({ projectUuid, flush = false }) => {
    const [isValidating, setIsValidating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
    const [sourceTypeFilter, setSourceTypeFilter] = useState<
        ValidationSourceType[]
    >([]);
    const [showConfigWarnings, setShowConfigWarnings] = useState(false);

    const targetValidationUuid = useSearchParams('validationUuid');
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const { user } = useApp();

    const { data: pinnedValidation } = usePinnedValidation(
        projectUuid,
        targetValidationUuid,
    );

    const handleUnpin = useCallback(() => {
        void navigate({ pathname }, { replace: true });
    }, [navigate, pathname]);

    const { data: summary } = useValidationSummary(projectUuid, user);
    const [activeGroup, setActiveGroup] = useState<ValidationErrorGroup | null>(
        null,
    );

    const { data, isLoading, isFetching, isError, fetchNextPage } =
        usePaginatedValidation(projectUuid, user, {
            pageSize: 20,
            searchQuery: debouncedSearch || undefined,
            sourceTypes:
                sourceTypeFilter.length > 0 ? sourceTypeFilter : undefined,
            errorTypes: activeGroup ? [activeGroup.errorType] : undefined,
            tableName: activeGroup?.tableName ?? undefined,
            fieldName: activeGroup?.fieldName ?? undefined,
            includeChartConfigWarnings: showConfigWarnings,
        });

    const { mutate: validateProject } = useValidationMutation(
        projectUuid,
        () => setIsValidating(false),
        () => setIsValidating(false),
    );

    const [selectedValidationError, setSelectedValidationError] =
        useState<ValidationErrorChartResponse>();
    const [selectedConfigError, setSelectedConfigError] =
        useState<ValidationErrorChartResponse>();
    const [selectedDashboardError, setSelectedDashboardError] =
        useState<ValidationErrorDashboardResponse>();

    // Bulk delete: from table row selection or from a summary group
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>(
        {},
    );
    const [selectionDeleteItems, setSelectionDeleteItems] = useState<
        ValidationContentItem[] | null
    >(null);
    const [deleteGroup, setDeleteGroup] = useState<ValidationErrorGroup | null>(
        null,
    );
    const { data: allValidations } = useAllValidations(
        projectUuid,
        deleteGroup !== null,
    );

    // Group delete targets charts referencing the model. Dashboards usually
    // have other healthy tiles, so they stay for manual review.
    const groupDeleteItems = useMemo(() => {
        if (!deleteGroup || !allValidations) return null;
        return dedupeContentItems(
            allValidations.flatMap((validation) => {
                if (
                    validation.source !== ValidationSourceType.Chart ||
                    !isChartValidationError(validation) ||
                    validation.tableName !== deleteGroup.tableName
                ) {
                    return [];
                }
                const item = getDeletableContentItem(validation);
                return item ? [item] : [];
            }),
        );
    }, [deleteGroup, allValidations]);

    const deleteModalItems = selectionDeleteItems ?? groupDeleteItems;

    const closeDeleteModal = useCallback(() => {
        setSelectionDeleteItems(null);
        setDeleteGroup(null);
    }, []);

    // Selection references loaded rows, so clear it when the result set changes
    useEffect(() => {
        setRowSelection({});
    }, [
        debouncedSearch,
        sourceTypeFilter,
        showConfigWarnings,
        activeGroup?.groupKey,
    ]);

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const deduplicatedData = useMemo(() => {
        if (!pinnedValidation) return flatData;
        return flatData.filter(
            (item) => item.validationUuid !== pinnedValidation.validationUuid,
        );
    }, [flatData, pinnedValidation]);

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;

    const lastValidatedAt = useMemo(() => {
        if (!flatData.length) return null;
        return flatData.reduce<Date | null>((max, item) => {
            const date = new Date(item.createdAt);
            return max === null || date > max ? date : max;
        }, null);
    }, [flatData]);

    // Check if filters are active to determine if we should always show the table
    const hasActiveFilters =
        searchQuery !== '' ||
        sourceTypeFilter.length > 0 ||
        showConfigWarnings ||
        activeGroup !== null;

    const content = (
        <>
            <FixValidationErrorModal
                key={selectedValidationError?.validationUuid}
                validationError={selectedValidationError}
                allValidationErrors={flatData}
                onClose={() => {
                    setSelectedValidationError(undefined);
                }}
            />
            <FixDashboardFilterModal
                validationError={selectedDashboardError}
                allValidationErrors={flatData}
                onClose={() => {
                    setSelectedDashboardError(undefined);
                }}
            />
            <ChartConfigurationErrorModal
                validationError={selectedConfigError}
                onClose={() => {
                    setSelectedConfigError(undefined);
                }}
            />
            <BulkDeleteContentModal
                projectUuid={projectUuid}
                items={deleteModalItems ?? []}
                opened={deleteModalItems !== null}
                onClose={closeDeleteModal}
                onDeleted={() => setRowSelection({})}
            />
            <Stack gap="sm">
                {summary && (
                    <ValidationSummarySection
                        summary={summary}
                        activeGroupKey={activeGroup?.groupKey ?? null}
                        onToggleGroup={(group) =>
                            setActiveGroup((current) =>
                                current?.groupKey === group.groupKey
                                    ? null
                                    : group,
                            )
                        }
                        onDeleteGroup={setDeleteGroup}
                    />
                )}
                {isLoading ? (
                    <Paper withBorder shadow="sm">
                        <Group justify="center" gap="xs" p="md">
                            <Loader color="gray" />
                        </Group>
                    </Paper>
                ) : flatData.length > 0 ||
                  pinnedValidation ||
                  hasActiveFilters ? (
                    <ValidatorTable
                        data={deduplicatedData}
                        projectUuid={projectUuid}
                        onSelectValidationError={(validationError) => {
                            if (isChartValidationError(validationError)) {
                                if (
                                    validationError.errorType ===
                                    ValidationErrorType.ChartConfiguration
                                ) {
                                    setSelectedConfigError(validationError);
                                } else {
                                    setSelectedValidationError(validationError);
                                }
                            } else if (
                                isFixableDashboardValidationError(
                                    validationError,
                                )
                            ) {
                                setSelectedDashboardError(validationError);
                            }
                        }}
                        isFetching={isFetching}
                        isLoading={isLoading}
                        isError={isError}
                        totalDBRowCount={totalDBRowCount}
                        fetchNextPage={fetchNextPage}
                        pinnedValidation={pinnedValidation}
                        onUnpin={handleUnpin}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        sourceTypeFilter={sourceTypeFilter}
                        setSourceTypeFilter={setSourceTypeFilter}
                        showConfigWarnings={showConfigWarnings}
                        setShowConfigWarnings={setShowConfigWarnings}
                        lastValidatedAt={lastValidatedAt}
                        flush={flush}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        onBulkDelete={setSelectionDeleteItems}
                    />
                ) : (
                    <Paper withBorder shadow="sm">
                        <Group justify="center" gap="xs" p="md">
                            <MantineIcon icon={IconCheck} color="green" />
                            <Text fw={500} c="ldGray.7">
                                No validation errors found
                            </Text>
                        </Group>
                    </Paper>
                )}
            </Stack>
        </>
    );

    if (flush) {
        return content;
    }

    return (
        <SettingsPage
            title="Validator"
            description="Find content errors and issues across this project."
            actions={
                <Button
                    size="xs"
                    onClick={() => {
                        setIsValidating(true);
                        validateProject();
                    }}
                    loading={isValidating}
                >
                    Run validation
                </Button>
            }
        >
            {content}
        </SettingsPage>
    );
};
