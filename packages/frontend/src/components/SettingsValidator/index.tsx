import {
    isChartValidationError,
    ValidationErrorType,
    ValidationSourceType,
    type ValidationErrorChartResponse,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Loader,
    MultiSelect,
    Paper,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconSearch } from '@tabler/icons-react';
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
import { formatTime } from '../SchedulersView/SchedulersViewUtils';
import { ValidatorTable } from './ValidatorTable';
import { ChartConfigurationErrorModal } from './ValidatorTable/ChartConfigurationErrorModal';
import { FixValidationErrorModal } from './ValidatorTable/FixValidationErrorModal';

const SOURCE_TYPE_OPTIONS = [
    { value: ValidationSourceType.Chart, label: 'Chart' },
    { value: ValidationSourceType.Dashboard, label: 'Dashboard' },
    { value: ValidationSourceType.Table, label: 'Table' },
];

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const [isValidating, setIsValidating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
    const [sourceTypeFilter, setSourceTypeFilter] = useState<string[]>([]);
    const [showConfigWarnings, setShowConfigWarnings] = useState(false);

    const targetValidationId = useSearchParams('validationId');
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const { user } = useApp();

    const { data: pinnedValidation } = usePinnedValidation(
        projectUuid,
        targetValidationId ? Number(targetValidationId) : null,
    );

    const handleUnpin = useCallback(() => {
        void navigate({ pathname }, { replace: true });
    }, [navigate, pathname]);

    const { data, isLoading, isFetching, isError, fetchNextPage } =
        usePaginatedValidation(projectUuid, user, {
            pageSize: 20,
            searchQuery: debouncedSearch || undefined,
            sourceTypes:
                sourceTypeFilter.length > 0
                    ? (sourceTypeFilter as ValidationSourceType[])
                    : undefined,
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

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const deduplicatedData = useMemo(() => {
        if (!pinnedValidation) return flatData;
        return flatData.filter(
            (item) => item.validationId !== pinnedValidation.validationId,
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

    return (
        <>
            <FixValidationErrorModal
                validationError={selectedValidationError}
                allValidationErrors={flatData}
                onClose={() => {
                    setSelectedValidationError(undefined);
                }}
            />
            <ChartConfigurationErrorModal
                validationError={selectedConfigError}
                onClose={() => {
                    setSelectedConfigError(undefined);
                }}
            />
            <Group gap="md" justify="space-between">
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

            <Paper withBorder shadow="sm">
                <Group justify="space-between" p="md">
                    <Group gap="md" w="100%">
                        <TextInput
                            flex={1}
                            size="xs"
                            placeholder="Search by name or error..."
                            leftSection={<IconSearch size={14} />}
                            value={searchQuery}
                            onChange={(e) =>
                                setSearchQuery(e.currentTarget.value)
                            }
                            w={250}
                        />
                        <MultiSelect
                            size="xs"
                            placeholder="All sources"
                            data={SOURCE_TYPE_OPTIONS}
                            value={sourceTypeFilter}
                            onChange={setSourceTypeFilter}
                            clearable
                            w={200}
                        />
                        <Checkbox
                            size="xs"
                            label="Show config warnings"
                            checked={showConfigWarnings}
                            onChange={(e) =>
                                setShowConfigWarnings(e.currentTarget.checked)
                            }
                        />
                    </Group>
                    <Group gap="md">
                        {lastValidatedAt && (
                            <Text fw={500} fz="xs" c="ldGray.6">
                                Last validated at: {formatTime(lastValidatedAt)}
                            </Text>
                        )}
                        {totalDBRowCount > 0 && (
                            <Text fz="xs" c="ldGray.6">
                                {totalDBRowCount} error
                                {totalDBRowCount === 1 ? '' : 's'}
                            </Text>
                        )}
                    </Group>
                </Group>

                {isLoading ? (
                    <Group justify="center" gap="xs" p="md">
                        <Loader color="gray" />
                    </Group>
                ) : flatData.length > 0 || pinnedValidation ? (
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
                            }
                        }}
                        isFetching={isFetching}
                        isLoading={isLoading}
                        isError={isError}
                        totalDBRowCount={totalDBRowCount}
                        fetchNextPage={fetchNextPage}
                        pinnedValidation={pinnedValidation}
                        onUnpin={handleUnpin}
                    />
                ) : (
                    <Group justify="center" gap="xs" p="md">
                        <MantineIcon icon={IconCheck} color="green" />
                        <Text fw={500} c="ldGray.7">
                            No validation errors found
                        </Text>
                    </Group>
                )}
            </Paper>
        </>
    );
};
