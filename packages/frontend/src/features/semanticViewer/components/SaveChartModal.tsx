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
import { useCallback, useEffect, useState, type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    SaveDestination,
    SaveToSpace,
    validationSchema,
} from '../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import {
    // useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectCurrentChartConfig,
    selectTableVisConfigState,
} from '../store/selectors';
import { updateName } from '../store/semanticViewerSlice';

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const SaveSqlChartModal: FC<Props> = ({ opened, onClose }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(
        (state) => state.semanticViewer.projectUuid,
    );

    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);

    const [isFormPopulated, setIsFormPopulated] = useState(false);
    const name = useAppSelector((state) => state.semanticViewer.name);
    const description = useAppSelector(
        (state) => state.semanticViewer.description,
    );
    // const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

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
        if (!isFormPopulated) {
            if (name) {
                form.setFieldValue('name', name);
            }
            if (description) {
                form.setFieldValue('description', description);
            }
            if (spaces.length > 0) {
                form.setFieldValue('spaceUuid', spaces[0].uuid);
            }
            setIsFormPopulated(true);
        }
    }, [name, form, description, spaces, isFormPopulated]);

    const sql = useAppSelector((state) => state.semanticViewer.sql);
    // const limit = useAppSelector((state) => state.semanticViewer.limit);
    const selectedChartConfig = useAppSelector(selectCurrentChartConfig);
    const defaultChartConfig = useAppSelector(selectTableVisConfigState);
    /*
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
*/
    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) {
            return;
        }
        /*let newSpace = form.values.newSpaceName
            ? await createSpace({
                  name: form.values.newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;
        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spaces[0].uuid;
*/
        const configToSave = selectedChartConfig ?? defaultChartConfig.config;

        if (configToSave && sql) {
            console.error('Not implemented');
            /* await createSavedSqlChart({
                name: form.values.name,
                description: form.values.description || '',
                sql,
                limit,
                config: configToSave,
                spaceUuid: spaceUuid,
            });*/
        }

        dispatch(updateName(form.values.name));

        onClose();
    }, [
        spaces,
        //form.values.newSpaceName,
        //form.values.spaceUuid,
        form.values.name,
        //form.values.description,
        //createSpace,
        selectedChartConfig,
        defaultChartConfig.config,
        sql,
        dispatch,
        onClose,
        //createSavedSqlChart,
        //limit,
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
                        // disabled={isCreatingSavedSqlChart}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !sql}
                        //  loading={isCreatingSavedSqlChart}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
