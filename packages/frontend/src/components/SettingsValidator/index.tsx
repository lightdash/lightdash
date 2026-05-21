import {
    isChartValidationError,
    isFixableDashboardValidationError,
    ValidationErrorType,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
    type ValidationSourceType,
} from '@lightdash/common';
import { Button, Group, Loader, Paper, Text } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useSearchParams from '../../hooks/useSearchParams';
import {
    usePaginatedValidation,
    usePinnedValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { ValidatorTable } from './ValidatorTable';
import { ChartConfigurationErrorModal } from './ValidatorTable/ChartConfigurationErrorModal';
import { FixDashboardFilterModal } from './ValidatorTable/FixDashboardFilterModal';
import { FixValidationErrorModal } from './ValidatorTable/FixValidationErrorModal';

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
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

    const { data, isLoading, isFetching, isError, fetchNextPage } =
        usePaginatedValidation(projectUuid, user, {
            pageSize: 20,
            searchQuery: debouncedSearch || undefined,
            sourceTypes:
                sourceTypeFilter.length > 0 ? sourceTypeFilter : undefined,
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
        searchQuery !== '' || sourceTypeFilter.length > 0 || showConfigWarnings;

    return (
        <>
            <FixValidationErrorModal
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
            <Group gap="md" justify="space-between" mb="md">
                <Text c="dimmed">
                    Use the project validator to check what content is broken in
                    your project.
                </Text>
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
            </Group>

            {isLoading ? (
                <Paper withBorder shadow="sm">
                    <Group justify="center" gap="xs" p="md">
                        <Loader color="gray" />
                    </Group>
                </Paper>
            ) : flatData.length > 0 || pinnedValidation || hasActiveFilters ? (
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
                            isFixableDashboardValidationError(validationError)
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
        </>
    );
};
