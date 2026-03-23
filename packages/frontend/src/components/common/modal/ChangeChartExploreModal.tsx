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
} from '@mantine-8/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { lightdashApi } from '../../../api';
import { pollJobStatus } from '../../../features/scheduler/hooks/useScheduler';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplores } from '../../../hooks/useExplores';
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
}

const FORM_ID = 'change-chart-explore-form';

const ChangeChartExploreModal: FC<ChangeChartExploreModalProps> = ({
    opened,
    onClose,
    projectUuid,
    chartUuid,
    currentExploreName,
}) => {
    const queryClient = useQueryClient();
    const [selectedExplore, setSelectedExplore] = useState<string | null>(null);
    const [fixAll, setFixAll] = useState(false);
    const [search, setSearch] = useState('');
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();

    const { data: explores, isLoading: isLoadingExplores } = useExplores(
        projectUuid,
        true,
    );

    const exploreOptions = useMemo(
        () =>
            (explores ?? [])
                .filter((e) => !isSummaryExploreError(e))
                .map((e) => ({
                    value: e.name,
                    label: e.label ?? e.name,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [explores],
    );

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

        try {
            const result = await rename({
                from: currentExploreName,
                to: selectedExplore,
                fixAll,
            });

            showToastSuccess({
                key: 'change_chart_explore_toast',
                title: `Explore changed to "${selectedExplore}"`,
            });

            if (fixAll && result?.jobId) {
                showToastInfo({
                    key: 'change_chart_explore_fixall_toast',
                    title: `Updating other charts using "${currentExploreName}"...`,
                });
                pollJobStatus(result.jobId)
                    .then((status) => {
                        const totalCharts =
                            status?.results?.charts?.length || 0;
                        showToastSuccess({
                            key: 'change_chart_explore_fixall_toast',
                            title: `Updated ${totalCharts} other chart${totalCharts === 1 ? '' : 's'}`,
                        });
                    })
                    .catch((jobError) => {
                        showToastError({
                            key: 'change_chart_explore_fixall_toast',
                            title: 'Unable to update other charts',
                            subtitle: getErrorMessage(jobError),
                        });
                    });
            }

            handleClose();
            await queryClient.invalidateQueries(['saved_query', chartUuid]);
        } catch (error) {
            const apiError = error as ApiError;
            showToastError({
                key: 'change_chart_explore_toast',
                title: 'Unable to change explore',
                subtitle: apiError?.error?.message,
            });
        }
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Change explore"
            icon={IconArrowsExchange}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={!canSubmit}
                    loading={isRenaming}
                >
                    Change explore
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit}>
                <Stack>
                    <Text fz="sm" c="dimmed">
                        Change which explore this chart uses. All field
                        references will be remapped to the new explore.
                    </Text>

                    <Text fz="sm">
                        Current explore:{' '}
                        <Text span fw={600}>
                            {currentExploreName}
                        </Text>
                    </Text>

                    {isLoadingExplores ? (
                        <Loader size="sm" />
                    ) : (
                        <Select
                            label="New explore"
                            placeholder="Select an explore"
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
                                    ? 'Please select a different explore'
                                    : undefined
                            }
                        />
                    )}

                    <Checkbox
                        size="xs"
                        label="Also update all other charts using this explore"
                        checked={fixAll}
                        onChange={(e) => setFixAll(e.currentTarget.checked)}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChangeChartExploreModal;
