import { subject } from '@casl/ability';
import { Button, LoadingOverlay } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineModal from '../../../../../components/common/MantineModal';
import SaveToDashboardForm from '../../../../../components/common/modal/ChartCreateModal/SaveToDashboardForm';
import {
    saveToDashboardSchema,
    saveToSpaceSchema,
    type SaveToDashboardFormType,
    type SaveToSpaceFormType,
} from '../../../../../components/common/modal/ChartCreateModal/types';
import { useCreateMutation as useCreateDashboardMutation } from '../../../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../../../hooks/dashboard/useDashboards';
import useToaster from '../../../../../hooks/toaster/useToaster';
import {
    useCreateMutation as useCreateSpaceMutation,
    useSpaceSummaries,
} from '../../../../../hooks/useSpaces';
import useApp from '../../../../../providers/App/useApp';
import {
    useSaveComposerArtifactToDashboard,
    type AiAgentArtifactVersionRef,
} from '../../hooks/useAiAgentArtifacts';
import { useIsAiAgentNavigationDisabled } from '../../hooks/useIsAiAgentNavigationDisabled';

type FormValues = SaveToDashboardFormType & SaveToSpaceFormType;

const resolver = zodResolver(saveToDashboardSchema.merge(saveToSpaceSchema));

type Props = {
    opened: boolean;
    onClose: () => void;
    artifact: AiAgentArtifactVersionRef;
};

/** Picks the dashboard a composer artifact is saved to: an existing one, or a new one in a space. */
export const AiComposerSaveToDashboardModal: FC<Props> = ({
    opened,
    onClose,
    artifact,
}) => {
    const { projectUuid } = artifact;
    const { user } = useApp();
    const navigate = useNavigate();
    const navigationDisabled = useIsAiAgentNavigationDisabled();
    const { showToastSuccess } = useToaster();
    const [isCreatingNewDashboard, setIsCreatingNewDashboard] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);

    const form = useForm<FormValues>({
        initialValues: {
            dashboardUuid: null,
            newDashboardName: null,
            newDashboardDescription: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: resolver,
    });

    const { data: dashboards, isLoading: isLoadingDashboards } = useDashboards(
        projectUuid,
        { enabled: opened, staleTime: 0 },
        true,
    );
    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
        {
            enabled: opened,
            staleTime: 0,
            select: (data) =>
                data.filter((space) =>
                    user.data?.ability.can(
                        'create',
                        subject('Dashboard', {
                            ...space,
                            access: space.userAccess ? [space.userAccess] : [],
                        }),
                    ),
                ),
        },
    );
    const { mutateAsync: createDashboard } = useCreateDashboardMutation(
        projectUuid,
        false,
        { showToastOnSuccess: false },
    );
    const { mutateAsync: createSpace } = useCreateSpaceMutation(projectUuid);
    const { mutateAsync: save, isLoading: isSaving } =
        useSaveComposerArtifactToDashboard(artifact);

    const { reset } = form;
    useEffect(() => {
        if (opened) return;
        reset();
        setIsCreatingNewDashboard(false);
        setIsCreatingNewSpace(false);
    }, [opened, reset]);

    const startCreatingNewDashboard = () => {
        setIsCreatingNewDashboard(true);
        if (!spaces || spaces.length === 0) {
            setIsCreatingNewSpace(true);
            return;
        }
        if (!form.values.spaceUuid) {
            form.setFieldValue(
                'spaceUuid',
                spaces.find((space) => !space.parentSpaceUuid)?.uuid ??
                    spaces[0].uuid,
            );
        }
    };

    const resolveDashboardUuid = async (
        values: FormValues,
    ): Promise<string | null> => {
        if (!isCreatingNewDashboard) return values.dashboardUuid;
        if (!values.newDashboardName) return null;
        let spaceUuid = values.spaceUuid;
        if (isCreatingNewSpace && values.newSpaceName) {
            const space = await createSpace({
                name: values.newSpaceName,
                inheritParentPermissions: true,
                access: [],
            });
            spaceUuid = space.uuid;
        }
        if (!spaceUuid) return null;
        const dashboard = await createDashboard({
            name: values.newDashboardName,
            description: values.newDashboardDescription ?? '',
            spaceUuid,
            tiles: [],
            tabs: [],
        });
        return dashboard.uuid;
    };

    const submit = async (values: FormValues) => {
        const dashboardUuid = await resolveDashboardUuid(values);
        if (!dashboardUuid) return;
        const { dashboard } = await save({ dashboardUuid });
        showToastSuccess({
            title: `Chart saved to "${dashboard.name}"`,
            action: navigationDisabled
                ? undefined
                : {
                      children: 'Open dashboard',
                      onClick: () =>
                          navigate(
                              `/projects/${projectUuid}/dashboards/${dashboard.uuid}`,
                          ),
                  },
        });
        onClose();
    };

    const canSubmit = isCreatingNewDashboard
        ? !!form.values.newDashboardName &&
          (isCreatingNewSpace
              ? !!form.values.newSpaceName
              : !!form.values.spaceUuid)
        : !!form.values.dashboardUuid;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save to dashboard"
            icon={IconLayoutDashboard}
            size="lg"
            actions={
                <Button
                    type="submit"
                    form="composer-save-to-dashboard-form"
                    disabled={!canSubmit}
                    loading={isSaving}
                >
                    Save
                </Button>
            }
        >
            <LoadingOverlay visible={isSaving} />
            <form
                id="composer-save-to-dashboard-form"
                onSubmit={form.onSubmit((values) =>
                    submit(values).catch(() => undefined),
                )}
            >
                <SaveToDashboardForm
                    form={form}
                    spaces={spaces}
                    dashboards={dashboards}
                    isLoading={isLoadingDashboards || isLoadingSpaces}
                    isCreatingNewDashboard={isCreatingNewDashboard}
                    onStartCreatingNewDashboard={startCreatingNewDashboard}
                    onCancelCreatingNewDashboard={() => {
                        setIsCreatingNewDashboard(false);
                        setIsCreatingNewSpace(false);
                        form.setFieldValue('newDashboardName', null);
                        form.setFieldValue('newDashboardDescription', null);
                        form.setFieldValue('newSpaceName', null);
                    }}
                    isCreatingNewSpaceForDashboard={isCreatingNewSpace}
                    onStartCreatingNewSpaceForDashboard={() =>
                        setIsCreatingNewSpace(true)
                    }
                    onCancelCreatingNewSpaceForDashboard={() => {
                        setIsCreatingNewSpace(false);
                        form.setFieldValue('newSpaceName', null);
                    }}
                />
            </form>
        </MantineModal>
    );
};
