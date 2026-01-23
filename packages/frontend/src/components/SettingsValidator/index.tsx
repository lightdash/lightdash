import {
    isChartValidationError,
    isDashboardValidationError,
    isFixableDashboardValidationError,
    ValidationErrorType,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    Paper,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    useValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import useApp from '../../providers/App/useApp';
import { formatTime } from '../SchedulersView/SchedulersViewUtils';
import MantineIcon from '../common/MantineIcon';
import { ValidatorTable } from './ValidatorTable';
import { ChartConfigurationErrorModal } from './ValidatorTable/ChartConfigurationErrorModal';
import { FixDashboardFilterModal } from './ValidatorTable/FixDashboardFilterModal';
import { FixValidationErrorModal } from './ValidatorTable/FixValidationErrorModal';

const MIN_ROWS_TO_ENABLE_SCROLLING = 6;

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const [isValidating, setIsValidating] = useState(false);

    const { user } = useApp();
    const { data, isLoading } = useValidation(projectUuid, user, true); // Note: Users that land on this page can always manage validations
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
    const [showConfigWarnings, setShowConfigWarnings] = useState(false);

    const configWarningCount = useMemo(() => {
        if (!data) return 0;
        return data.filter(
            (error) =>
                isChartValidationError(error) &&
                error.errorType === ValidationErrorType.ChartConfiguration,
        ).length;
    }, [data]);

    // Filter out chart configuration warnings unless checkbox is checked
    const filteredData = useMemo(() => {
        if (!data) return undefined;
        if (showConfigWarnings) return data;
        return data.filter(
            (error) =>
                !isChartValidationError(error) ||
                error.errorType !== ValidationErrorType.ChartConfiguration,
        );
    }, [data, showConfigWarnings]);

    return (
        <>
            <FixValidationErrorModal
                validationError={selectedValidationError}
                allValidationErrors={data}
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
            <FixDashboardFilterModal
                validationError={selectedDashboardError}
                onClose={() => {
                    setSelectedDashboardError(undefined);
                }}
            />
            <Text color="dimmed">
                Use the project validator to check what content is broken in
                your project.
            </Text>

            <Paper withBorder shadow="sm">
                <Group
                    position="apart"
                    p="md"
                    sx={{
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: theme.colors.ldGray[3],
                    }}
                >
                    <Group spacing="lg">
                        <Text fw={500} fz="xs" c="ldGray.6">
                            {!!data?.length
                                ? `Last validated at: ${formatTime(
                                      data[0].createdAt,
                                  )}`
                                : null}
                        </Text>
                        <Checkbox
                            size="xs"
                            label={`Show chart configuration warnings (${configWarningCount})`}
                            checked={showConfigWarnings}
                            onChange={(e) =>
                                setShowConfigWarnings(e.currentTarget.checked)
                            }
                        />
                    </Group>
                    <Button
                        onClick={() => {
                            setIsValidating(true);
                            validateProject();
                        }}
                        loading={isValidating}
                    >
                        Run validation
                    </Button>
                </Group>
                <Box
                    sx={{
                        overflowY:
                            filteredData &&
                            filteredData.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? 'scroll'
                                : 'auto',
                        maxHeight:
                            filteredData &&
                            filteredData.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? '500px'
                                : 'auto',
                    }}
                >
                    {isLoading ? (
                        <Group position="center" spacing="xs" p="md">
                            <Loader color="gray" />
                        </Group>
                    ) : !!filteredData?.length ? (
                        <>
                            <ValidatorTable
                                data={filteredData}
                                projectUuid={projectUuid}
                                onSelectValidationError={(validationError) => {
                                    if (
                                        isChartValidationError(validationError)
                                    ) {
                                        if (
                                            validationError.errorType ===
                                            ValidationErrorType.ChartConfiguration
                                        ) {
                                            setSelectedConfigError(
                                                validationError,
                                            );
                                        } else {
                                            setSelectedValidationError(
                                                validationError,
                                            );
                                        }
                                    } else if (
                                        isFixableDashboardValidationError(
                                            validationError,
                                        )
                                    ) {
                                        setSelectedDashboardError(
                                            validationError as ValidationErrorDashboardResponse,
                                        );
                                    }
                                }}
                            />
                        </>
                    ) : (
                        <Group position="center" spacing="xs" p="md">
                            <MantineIcon icon={IconCheck} color="green" />
                            <Text fw={500} c="ldGray.7">
                                No validation errors found
                            </Text>
                        </Group>
                    )}
                </Box>
            </Paper>
        </>
    );
};
