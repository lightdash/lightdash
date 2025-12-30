import { DbtProjectType, snakeCaseName } from '@lightdash/common';
import { Button, Stack, TextInput, Tooltip } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconInfoCircle, IconTableAlias } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { useGitIntegration } from '../../../hooks/gitIntegration/useGitIntegration';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCreateVirtualView } from '../hooks/useVirtualView';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

const FORM_ID = 'create-virtual-view-form';

export const CreateVirtualViewModal: FC<Props> = ({ opened, onClose }) => {
    const health = useHealth();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);

    const name = useAppSelector((state) => state.sqlRunner.name);

    const {
        mutateAsync: createVirtualView,
        isLoading: isLoadingVirtual,
        error,
    } = useCreateVirtualView({
        projectUuid,
    });
    const form = useForm<FormValues>({
        initialValues: {
            name: name || '',
        },
        validate: zodResolver(validationSchema),
    });

    const { data: project } = useProject(projectUuid);
    const { data: gitIntegration, isError } = useGitIntegration();

    const canWriteToDbtProject = !!(
        health.data?.hasGithub &&
        gitIntegration?.enabled === true &&
        !isError &&
        project?.dbtConnection.type === DbtProjectType.GITHUB
    );

    const handleSubmit = useCallback(
        async (data: { name: string }) => {
            if (!columns) {
                return;
            }

            await createVirtualView({
                name: snakeCaseName(data.name),
                sql,
                columns,
                projectUuid,
            });

            onClose();
        },
        [columns, onClose, projectUuid, sql, createVirtualView],
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Create virtual view"
            icon={IconTableAlias}
            size="md"
            cancelDisabled={isLoadingVirtual}
            headerActions={
                <Tooltip
                    variant="xs"
                    withinPortal
                    multiline
                    maw={300}
                    label={`Create a virtual view so others can reuse this query in Lightdash. The query won't be saved to or managed in your dbt project. ${
                        canWriteToDbtProject
                            ? "If you're expecting to reuse this query regularly, we suggest writing it back to dbt."
                            : ''
                    } `}
                >
                    <MantineIcon color="ldGray.7" icon={IconInfoCircle} />
                </Tooltip>
            }
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={!form.values.name || !sql}
                    loading={isLoadingVirtual}
                >
                    Create
                </Button>
            }
        >
            <form id={FORM_ID} onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <TextInput
                        label="Name"
                        required
                        {...form.getInputProps('name')}
                        error={!!error?.error}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
