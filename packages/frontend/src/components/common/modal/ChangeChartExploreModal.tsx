import { subject } from '@casl/ability';
import {
    getErrorMessage,
    isSummaryExploreError,
    RenameType,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiRenameChartBody,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Highlight,
    Loader,
    Select,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import { pollJobStatus } from '../../../features/scheduler/hooks/useScheduler';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplores } from '../../../hooks/useExplores';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

const renameChartExplore = async ({
    projectUuid,
    chartUuid,
    from,
    to,
    fixAll,
}: {
    projectUuid: string;
    chartUuid: string;
    from: string;
    to: string;
    fixAll: boolean;
}) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/rename/chart/${chartUuid}`,
        method: 'POST',
        body: JSON.stringify({
            from,
            to,
            fixAll,
            type: RenameType.MODEL,
        } satisfies ApiRenameChartBody),
    });
};

interface ChangeChartExploreModalProps extends Pick<
    ModalProps,
    'opened' | 'onClose'
> {
    projectUuid: string;
    chartUuid: string;
    currentExploreName: string;
    hasUnsavedChanges: boolean;
    candidateExploreNames?: string[];
}

const FORM_ID = 'change-chart-explore-form';

const ChangeChartExploreModal: FC<ChangeChartExploreModalProps> = ({
    opened,
    onClose,
    projectUuid,
    chartUuid,
    currentExploreName,
    hasUnsavedChanges,
    candidateExploreNames,
}) => {
    const { t } = useTranslation('modals');
    const queryClient = useQueryClient();
    const { user } = useApp();
    const [selectedExplore, setSelectedExplore] = useState<string | null>(null);
    const [fixAll, setFixAll] = useState(false);
    const [search, setSearch] = useState('');
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();

    const userCanUpdateProject =
        user.data?.ability.can(
            'update',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const { data: explores, isLoading: isLoadingExplores } = useExplores(
        projectUuid,
        true,
    );

    const exploreOptions = useMemo(() => {
        const candidateSet = candidateExploreNames
            ? new Set(candidateExploreNames)
            : undefined;
        return (explores ?? [])
            .reduce<{ value: string; label: string }[]>((acc, e) => {
                if (
                    !isSummaryExploreError(e) &&
                    (candidateSet === undefined || candidateSet.has(e.name))
                ) {
                    acc.push({ value: e.name, label: e.label ?? e.name });
                }
                return acc;
            }, [])
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [candidateExploreNames, explores]);

    const { mutateAsync: rename, isLoading: isRenaming } = useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        { from: string; to: string; fixAll: boolean }
    >({
        mutationKey: ['change-chart-explore', chartUuid],
        mutationFn: (data) =>
            renameChartExplore({
                projectUuid,
                chartUuid,
                ...data,
            }),
    });

    const isSameExplore = selectedExplore === currentExploreName;
    const canSubmit = !!selectedExplore && !isSameExplore && !isRenaming;

    const handleClose = () => {
        setSelectedExplore(null);
        setFixAll(false);
        setSearch('');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedExplore || isSameExplore) return;

        const fixAllAllowed = fixAll && userCanUpdateProject;

        try {
            const result = await rename({
                from: currentExploreName,
                to: selectedExplore,
                fixAll: fixAllAllowed,
            });

            showToastSuccess({
                key: 'change_chart_explore_toast',
                title: t('changeChartExplore.toast.changed', {
                    exploreName: selectedExplore,
                }),
            });

            if (fixAllAllowed && result?.jobId) {
                showToastInfo({
                    key: 'change_chart_explore_fixall_toast',
                    title: t('changeChartExplore.toast.updatingOthers', {
                        exploreName: currentExploreName,
                    }),
                });
                pollJobStatus(result.jobId)
                    .then((status) => {
                        const totalCharts =
                            status?.results?.charts?.length || 0;
                        showToastSuccess({
                            key: 'change_chart_explore_fixall_toast',
                            title: t('changeChartExplore.toast.updatedOthers', {
                                count: totalCharts,
                            }),
                        });
                    })
                    .catch((jobError) => {
                        showToastError({
                            key: 'change_chart_explore_fixall_toast',
                            title: t(
                                'changeChartExplore.toast.updateOthersFailed',
                            ),
                            subtitle: getErrorMessage(jobError),
                        });
                    });
            }

            handleClose();
            await queryClient.invalidateQueries(['saved_query', chartUuid]);
            await queryClient.resetQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'dashboard_chart_ready_query' &&
                    query.queryKey[2] === chartUuid,
            });
        } catch (error) {
            const apiError = error as ApiError;
            showToastError({
                key: 'change_chart_explore_toast',
                title: t('changeChartExplore.toast.changeFailed'),
                subtitle: apiError?.error?.message,
            });
        }
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('changeChartExplore.title')}
            icon={IconArrowsExchange}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={!canSubmit}
                    loading={isRenaming}
                >
                    {t('changeChartExplore.submit')}
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit}>
                <Stack>
                    {hasUnsavedChanges && (
                        <Callout variant="warning">
                            {t('changeChartExplore.unsavedChangesWarning')}
                        </Callout>
                    )}

                    <Text fz="sm" c="dimmed">
                        {t('changeChartExplore.description')}
                    </Text>

                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="changeChartExplore.currentExplore"
                            values={{ exploreName: currentExploreName }}
                            components={{ name: <Text span fw={600} /> }}
                        />
                    </Text>

                    {isLoadingExplores ? (
                        <Loader size="sm" />
                    ) : (
                        <Select
                            label={t('changeChartExplore.newExploreLabel')}
                            placeholder={t(
                                'changeChartExplore.newExplorePlaceholder',
                            )}
                            data={exploreOptions}
                            value={selectedExplore}
                            onChange={setSelectedExplore}
                            searchable
                            searchValue={search}
                            onSearchChange={setSearch}
                            renderOption={({ option }) => (
                                <Highlight
                                    highlight={search}
                                    fz="sm"
                                    color="yellow"
                                >
                                    {option.label}
                                </Highlight>
                            )}
                            required
                            error={
                                isSameExplore
                                    ? t('changeChartExplore.sameExploreError')
                                    : undefined
                            }
                        />
                    )}

                    {userCanUpdateProject && (
                        <Checkbox
                            size="xs"
                            label={t('changeChartExplore.fixAllLabel')}
                            checked={fixAll}
                            onChange={(e) => setFixAll(e.currentTarget.checked)}
                        />
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChangeChartExploreModal;
