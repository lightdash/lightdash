import { ChartKind } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    SaveDestination,
    SaveToSpace,
    validationSchema,
} from '../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import { useCreateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateName } from '../store/sqlRunnerSlice';

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const SaveSqlChartModal: FC<Props> = ({ opened, onClose }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);

    const name = useAppSelector((state) => state.sqlRunner.name);
    const description = useAppSelector((state) => state.sqlRunner.description);
    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: '',
            spaceUuid: '',
            newSpaceName: '',
            saveDestination: SaveDestination.Space,
        },
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (!form.values.name && name) {
            form.setFieldValue('name', name);
        }
        if (!form.values.description && description) {
            form.setFieldValue('description', description);
        }
        if (!form.values.spaceUuid && spaces.length > 0) {
            form.setFieldValue('spaceUuid', spaces[0].uuid);
        }
    }, [name, form, description, spaces]);

    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === undefined ||
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? state.tableVisConfig.config
            : state.barChartConfig.config,
    );

    const {
        mutateAsync: createSavedSqlChart,
        isLoading: isCreatingSavedSqlChart,
        isSuccess: isSavedSqlChartCreated,
    } = useCreateSqlChartMutation(projectUuid);

    useEffect(() => {
        if (isSavedSqlChartCreated) {
            onClose();
        }
    }, [isSavedSqlChartCreated, onClose]);

    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) {
            return;
        }
        let newSpace = form.values.newSpaceName
            ? await createSpace({
                  name: form.values.newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;
        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spaces[0].uuid;
        if (config) {
            await createSavedSqlChart({
                name: form.values.name,
                description: form.values.description || '',
                sql,
                config,
                spaceUuid: spaceUuid,
            });
            dispatch(updateName(form.values.name));
        }
        onClose();
    }, [
        config,
        createSavedSqlChart,
        dispatch,
        form.values.description,
        form.values.name,
        form.values.spaceUuid,
        form.values.newSpaceName,
        onClose,
        spaces,
        sql,
        createSpace,
    ]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleOnSubmit)}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label="Enter a memorable name for your chart"
                            placeholder="eg. How many weekly active users do we have?"
                            required
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label="Description"
                            {...form.getInputProps('description')}
                        />
                    </Stack>
                    <SaveToSpace
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                    />
                </Stack>

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={isCreatingSavedSqlChart}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || config === undefined}
                        loading={isCreatingSavedSqlChart}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
