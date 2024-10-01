import {
    CustomViewType,
    DbtProjectType,
    getProjectDirectory,
    snakeCaseName,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Button,
    Group,
    List,
    Modal,
    Radio,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconInfoCircle, IconWriting } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useCreateCustomExplore } from '../hooks/useCustomExplore';
import { useAppSelector } from '../store/hooks';

const getCustomViewTypeAlertText = (customViewType: CustomViewType) => {
    switch (customViewType) {
        case CustomViewType.VIRTUAL:
            return "Create a virtual custom view so others can reuse this query in Lightdash, but it won't be written to or managed in your dbt project.";
        case CustomViewType.WRITE_BACK:
            return 'Create a new model in your dbt project from this SQL query. This will create a new branch and start a pull request (docs coming soon).';
        default:
            return undefined;
    }
};

const validationSchema = z.object({
    name: z.string().min(1),
    customViewType: z.nativeEnum(CustomViewType),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = ModalProps;

export const SaveCustomViewModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const { mutateAsync: createCustomExplore, isLoading } =
        useCreateCustomExplore({
            projectUuid,
        });
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            customViewType: CustomViewType.VIRTUAL,
        },
        validate: zodResolver(validationSchema),
    });

    const { data: project } = useProject(projectUuid);
    const { data: health } = useHealth();

    const canWriteToDbtProject = !!(
        health?.hasGithub &&
        project?.dbtConnection.type === DbtProjectType.GITHUB
    );
    const projectDirectory = useMemo(
        () =>
            canWriteToDbtProject
                ? getProjectDirectory(project?.dbtConnection)
                : undefined,
        [project?.dbtConnection, canWriteToDbtProject],
    );
    const basePathForDbtCustomView =
        `${projectDirectory}models/lightdash`.replace(/\/{2,}/g, '/');
    const filePathsForDbtCustomView = useMemo(
        () => [
            `${form.values.name || 'custom_view'}.sql`,
            `${form.values.name || 'custom_view'}.yml`,
        ],
        [form.values.name],
    );

    const handleSubmit = useCallback(
        async (data: { name: string }) => {
            if (!columns) {
                return;
            }

            if (form.values.customViewType === CustomViewType.WRITE_BACK) {
                // TODO: Implement dbt write-back
                return;
            }

            await createCustomExplore({
                name: snakeCaseName(data.name),
                sql,
                columns,
                projectUuid,
            });
            onClose();
        },
        [
            createCustomExplore,
            sql,
            columns,
            onClose,
            projectUuid,
            form.values.customViewType,
        ],
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconWriting} size="lg" color="gray.7" />
                    <Text fw={500}>Create custom view</Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label="Custom explores are a way to save a query that
                                you can reuse later when 'Querying from tables'.
                                You can use them to save time when you and your
                                organization want to run the same query again."
                    >
                        <MantineIcon
                            color="gray.7"
                            icon={IconInfoCircle}
                            size={16}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            radius="md"
                            label="Name"
                            required
                            {...form.getInputProps('name')}
                        />
                    </Stack>

                    <Radio.Group
                        label="Custom view type"
                        {...form.getInputProps('customViewType')}
                    >
                        <Group mt="md">
                            <Radio
                                size="xs"
                                value={CustomViewType.VIRTUAL}
                                label="Create virtual custom view"
                            />
                            <Radio
                                size="xs"
                                disabled={!canWriteToDbtProject}
                                value={CustomViewType.WRITE_BACK}
                                label="Write back to dbt project"
                            />
                        </Group>
                    </Radio.Group>

                    <Alert>
                        <Text fz="xs">
                            {getCustomViewTypeAlertText(
                                form.values.customViewType,
                            )}
                        </Text>
                    </Alert>

                    {form.values.customViewType ===
                        CustomViewType.WRITE_BACK && (
                        <Stack spacing="xs" pl="xs">
                            <Text fw={500}>
                                Files to be created in{' '}
                                <Badge
                                    radius="md"
                                    variant="light"
                                    color="gray.9"
                                    fz="xs"
                                >
                                    {/* TODO: Add as a Link to a new tab with the Github repo */}
                                    REPO NAME
                                </Badge>
                                :
                            </Text>
                            <List spacing="xs" pl="xs">
                                {filePathsForDbtCustomView.map((file) => (
                                    <Tooltip
                                        key={file}
                                        variant="xs"
                                        position="top-start"
                                        label={`${basePathForDbtCustomView}/${file}`}
                                        multiline
                                        withinPortal
                                        maw={300}
                                    >
                                        <List.Item fz="xs" ff="monospace">
                                            {file}
                                        </List.Item>
                                    </Tooltip>
                                ))}
                            </List>
                        </Stack>
                    )}
                </Stack>

                <Group position="right" w="100%" p="md">
                    <Button
                        color="gray.7"
                        onClick={onClose}
                        variant="outline"
                        disabled={isLoading}
                        size="xs"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !sql}
                        loading={isLoading}
                        size="xs"
                    >
                        Create
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
