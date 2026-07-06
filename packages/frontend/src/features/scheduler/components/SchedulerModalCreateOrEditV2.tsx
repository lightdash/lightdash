import {
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Modal,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import { type UseMutationResult } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import { useAiAgentButtonVisibility } from '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useSchedulerFormModal } from '../hooks/useSchedulerFormModal';
import {
    getVisibleSections,
    SCHEDULER_SECTIONS,
    type SchedulerSectionId,
} from './SchedulerForm/layout/navSections';
import { SchedulerAlertSection } from './SchedulerForm/layout/SchedulerAlertSection';
import { SchedulerDataFormatSection } from './SchedulerForm/layout/SchedulerDataFormatSection';
import classes from './SchedulerForm/layout/SchedulerDeliveryModal.module.css';
import { SchedulerDeliveryNav } from './SchedulerForm/layout/SchedulerDeliveryNav';
import { SchedulerMessageSection } from './SchedulerForm/layout/SchedulerMessageSection';
import { SchedulerPreviewPanel } from './SchedulerForm/layout/SchedulerPreviewPanel';
import { SchedulerSetupSection } from './SchedulerForm/layout/SchedulerSetupSection';
import { SchedulerFormAiInput } from './SchedulerForm/SchedulerFormAiInput';
import {
    SchedulerFormProvider,
    type SchedulerFormValues,
} from './SchedulerForm/schedulerFormContext';

interface Props {
    resourceUuid: string;
    resourceName?: string;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onClose: () => void;
    onBack: () => void;
    isChart?: boolean;
    isApp?: boolean;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    /** undefined = create mode, string = edit mode */
    schedulerUuidToEdit: string | undefined;
    /** Create-mode only: pre-fills the new delivery. */
    initialFormValues?: Partial<SchedulerFormValues>;
}

export const SchedulerModalCreateOrEditV2: FC<Props> = ({
    resourceUuid,
    resourceName,
    createMutation,
    schedulerUuidToEdit,
    initialFormValues,
    isChart = false,
    isApp,
    isThresholdAlert,
    itemsMap,
    currentParameterValues,
    availableParameters,
    onClose,
    onBack,
}) => {
    const isAiVisible = useAiAgentButtonVisibility();
    const projectUuid = useProjectUuid();

    const {
        isEditMode,
        isLoading,
        error,
        isLoadingSendNow,
        isMutating,
        savedSchedulerData,
        handleSubmit,
        handleSendNow,
        confirmText,
        form,
        dashboard,
        isThresholdAlertWithNoFields,
        numericMetrics,
        isDashboardTabsAvailable,
        requiredFiltersWithoutValues,
    } = useSchedulerFormModal({
        schedulerUuid: schedulerUuidToEdit,
        resourceUuid,
        isChart,
        isApp,
        isThresholdAlert,
        createMutation,
        onBack,
        itemsMap,
        currentParameterValues,
        initialFormValues,
    });

    const sections = useMemo(
        () =>
            getVisibleSections({
                isThresholdAlert: !!isThresholdAlert,
                isAiVisible,
                isApp: !!isApp,
            }),
        [isThresholdAlert, isAiVisible, isApp],
    );

    const [activeSection, setActiveSection] = useState<SchedulerSectionId>(
        sections[0],
    );
    const activeMeta = SCHEDULER_SECTIONS[activeSection];

    const hasRecipient = Boolean(
        (form.values.emailTargets?.length || 0) +
        (form.values.slackTargets?.length || 0) +
        (form.values.msTeamsTargets?.length || 0) +
        (form.values.googleChatTargets?.length || 0),
    );

    const canSendNow =
        hasRecipient && requiredFiltersWithoutValues.length === 0;

    // Name why the submit is blocked instead of failing silently on submit —
    // the offending field may live in a section the user isn't looking at.
    const blockedReason = !form.values.name
        ? `Give your ${isThresholdAlert ? 'alert' : 'delivery'} a name`
        : isThresholdAlert && !form.values.thresholds?.[0]?.fieldId
          ? 'Pick an alert field'
          : requiredFiltersWithoutValues.length > 0
            ? 'Some required filters are missing values'
            : !form.isValid()
              ? 'Complete the required fields'
              : null;

    const subtitle = [
        resourceName ?? dashboard?.name,
        isEditMode
            ? 'editing'
            : isThresholdAlert
              ? 'new alert'
              : 'new schedule',
    ]
        .filter(Boolean)
        .join(' · ');

    const renderSection = () => {
        switch (activeSection) {
            case 'setup':
                return (
                    <SchedulerSetupSection
                        isThresholdAlert={isThresholdAlert}
                    />
                );
            case 'data':
                return (
                    <SchedulerDataFormatSection
                        dashboard={dashboard}
                        savedSchedulerData={savedSchedulerData}
                        isApp={!!isApp}
                        isDashboardTabsAvailable={isDashboardTabsAvailable}
                        currentParameterValues={currentParameterValues}
                        availableParameters={availableParameters}
                        loading={isMutating || isLoading}
                    />
                );
            case 'message':
                return <SchedulerMessageSection />;
            case 'ai':
                return <SchedulerFormAiInput projectUuid={projectUuid} bare />;
            case 'alert':
                return (
                    <SchedulerAlertSection
                        numericMetrics={numericMetrics}
                        isThresholdAlertWithNoFields={
                            !!isThresholdAlertWithNoFields
                        }
                        projectUuid={projectUuid}
                        itemsMap={itemsMap}
                        currentParameterValues={currentParameterValues}
                        availableParameters={availableParameters}
                        loading={isMutating || isLoading}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <SchedulerFormProvider form={form}>
            <Modal.Root
                opened
                onClose={onClose}
                size={1080}
                padding={0}
                centered
                closeOnClickOutside={false}
            >
                <Modal.Overlay />
                <Modal.Content>
                    <div className={classes.content}>
                        <Group
                            className={classes.header}
                            px="xl"
                            py="md"
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Group gap="sm" wrap="nowrap">
                                <Paper p="6px" withBorder radius="md">
                                    <MantineIcon
                                        icon={
                                            isThresholdAlert
                                                ? IconBell
                                                : IconSend
                                        }
                                        size="md"
                                    />
                                </Paper>
                                <Stack gap={0}>
                                    <span className={classes.headerTitle}>
                                        {isThresholdAlert
                                            ? 'Alert'
                                            : 'Scheduled delivery'}
                                    </span>
                                    {subtitle && (
                                        <Text
                                            size="xs"
                                            className={classes.subtitle}
                                        >
                                            {subtitle}
                                        </Text>
                                    )}
                                </Stack>
                            </Group>
                            <Group gap="xs" wrap="nowrap">
                                <DocumentationHelpButton
                                    href={
                                        isThresholdAlert
                                            ? 'https://docs.lightdash.com/guides/how-to-create-alerts'
                                            : 'https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries'
                                    }
                                />
                                <Modal.CloseButton />
                            </Group>
                        </Group>

                        {isLoading || error ? (
                            <Box p="xl" mih={400}>
                                {isLoading ? (
                                    <Stack h={300} w="100%" align="center">
                                        <Text fw={600}>Loading scheduler</Text>
                                        <Loader size="lg" />
                                    </Stack>
                                ) : (
                                    error && <ErrorState error={error.error} />
                                )}
                            </Box>
                        ) : (
                            <>
                                <form
                                    id="scheduler-form"
                                    className={classes.body}
                                    onSubmit={form.onSubmit((values) =>
                                        handleSubmit(values),
                                    )}
                                >
                                    <SchedulerDeliveryNav
                                        sections={sections}
                                        active={activeSection}
                                        onSelect={setActiveSection}
                                    />
                                    <ScrollArea
                                        className={classes.center}
                                        type="hover"
                                        scrollbarSize={8}
                                    >
                                        <div className={classes.centerInner}>
                                            <Stack gap="lg">
                                                <Stack gap={2}>
                                                    <span
                                                        className={
                                                            classes.sectionTitle
                                                        }
                                                    >
                                                        {activeMeta.label}
                                                    </span>
                                                    {activeMeta.description && (
                                                        <span
                                                            className={
                                                                classes.sectionDescription
                                                            }
                                                        >
                                                            {
                                                                activeMeta.description
                                                            }
                                                        </span>
                                                    )}
                                                </Stack>
                                                {renderSection()}
                                            </Stack>
                                        </div>
                                    </ScrollArea>
                                    <SchedulerPreviewPanel
                                        dashboard={dashboard}
                                        isThresholdAlert={isThresholdAlert}
                                        numericMetrics={numericMetrics}
                                    />
                                </form>

                                <div className={classes.footer}>
                                    <Button variant="subtle" onClick={onBack}>
                                        Cancel
                                    </Button>
                                    <Group gap="sm">
                                        {!isThresholdAlert && (
                                            <Button
                                                variant="default"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconSend}
                                                    />
                                                }
                                                onClick={handleSendNow}
                                                loading={
                                                    isLoadingSendNow ||
                                                    isMutating
                                                }
                                                disabled={!canSendNow}
                                            >
                                                Send once now
                                            </Button>
                                        )}
                                        <Tooltip
                                            label={blockedReason ?? ''}
                                            disabled={blockedReason === null}
                                            fz="xs"
                                        >
                                            <Box>
                                                <Button
                                                    type="submit"
                                                    form="scheduler-form"
                                                    disabled={
                                                        isLoadingSendNow ||
                                                        isThresholdAlertWithNoFields ||
                                                        blockedReason !== null
                                                    }
                                                    loading={isMutating}
                                                >
                                                    {confirmText}
                                                </Button>
                                            </Box>
                                        </Tooltip>
                                    </Group>
                                </div>
                            </>
                        )}
                    </div>
                </Modal.Content>
            </Modal.Root>
        </SchedulerFormProvider>
    );
};
