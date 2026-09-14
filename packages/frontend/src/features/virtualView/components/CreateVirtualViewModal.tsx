import { DbtProjectType, snakeCaseName } from '@lightdash/common';
import { Button, Stack, TextInput, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconTableAlias } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
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
    name: z.string().min(1, 'Name is required'),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

const FORM_ID = 'create-virtual-view-form';

/**
 * Walkthrough action for create:VirtualView: turning a SQL runner query into
 * a table everyone can explore. The tour then opens New > Chart, where the
 * new table is listed.
 */
const createTourAction = {
    'data-tour-scope': 'create:VirtualView',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/sql-runner',
    'data-tour-label': 'Create the virtual view',
    'data-tour-title': 'Create a virtual view',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="new"] >> [data-tour-nav="new-sql-runner"] >> [data-tour-anchor="sql-runner-editor"] >> [data-tour-anchor="sql-runner-run"] >> [data-tour-anchor="sql-cta-menu"] >> [data-tour-anchor="sql-cta-virtual-view"] >> [data-tour-anchor="sql-create-virtual-view"] >> [data-tour-anchor="virtual-view-name"]',
    'data-tour-then':
        '[data-tour-nav="new"] >> [data-tour-nav="new-chart"] >> [data-tour-anchor="explore-search"] >> [data-tour-anchor="explore-section"][data-tour-value="Virtual Views"]',
    'data-tour-docs':
        'semantic-layer/virtual-views.mdx#create-a-virtual-view:1',
};

export const CreateVirtualViewModal: FC<Props> = ({ opened, onClose }) => {
    const health = useHealth();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const parameterValues = useAppSelector(
        (state) => state.sqlRunner.parameterValues,
    );

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
                parameterValues:
                    Object.keys(parameterValues).length > 0
                        ? parameterValues
                        : undefined,
            });

            onClose();
        },
        [
            columns,
            onClose,
            projectUuid,
            sql,
            parameterValues,
            createVirtualView,
        ],
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
                    data-tour-anchor="virtual-view-create-submit"
                    data-tour-hint="Create the virtual view"
                    {...createTourAction}
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
                        // Typed anchor for scope walkthroughs (data-tour-via)
                        data-tour-anchor="virtual-view-name"
                        data-tour-hint="Name the virtual view"
                        data-tour-input="true"
                        data-tour-suggest="Orders by status"
                        {...form.getInputProps('name')}
                        error={!!error?.error}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
