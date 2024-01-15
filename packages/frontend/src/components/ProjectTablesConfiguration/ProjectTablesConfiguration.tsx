import { subject } from '@casl/ability';
import { hasIntersection, TableSelectionType } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Collapse,
    MultiSelect,
    Radio,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useEffect, useMemo } from 'react';
import { useToggle } from 'react-use';
import { useExplores } from '../../hooks/useExplores';
import {
    useProjectTablesConfiguration,
    useUpdateProjectTablesConfiguration,
} from '../../hooks/useProjectTablesConfiguration';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useAbilityContext } from '../common/Authorization';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';

type FormData = {
    type: TableSelectionType;
    tags: string[];
    names: string[];
};

const ProjectTablesConfiguration: FC<{
    projectUuid: string;
    onSuccess?: () => void;
}> = ({ projectUuid, onSuccess }) => {
    const { track } = useTracking();
    const { user } = useApp();
    const ability = useAbilityContext();
    const [isListOpen, toggleList] = useToggle(false);

    const { data: explores, isInitialLoading: isLoadingExplores } =
        useExplores(projectUuid);
    const { data, isInitialLoading } =
        useProjectTablesConfiguration(projectUuid);
    const {
        mutate: update,
        isLoading: isSaving,
        isSuccess,
    } = useUpdateProjectTablesConfiguration(projectUuid);
    const canUpdateTableConfiguration = ability.can(
        'update',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const disabled =
        isInitialLoading ||
        isSaving ||
        isLoadingExplores ||
        !canUpdateTableConfiguration;
    const form = useForm<FormData>({
        initialValues: {
            type: TableSelectionType.ALL,
            tags: [],
            names: [],
        },
    });

    const modelsIncluded = useMemo<string[]>(() => {
        if (!explores) {
            return [];
        }
        const typeValue = form.values.type || TableSelectionType.ALL;
        const tagsValue = form.values.tags || [];
        const namesValue = form.values.names || [];
        if (typeValue === TableSelectionType.ALL) {
            return explores.map(({ name }) => name);
        }
        if (typeValue === TableSelectionType.WITH_NAMES) {
            return namesValue;
        }
        if (
            typeValue === TableSelectionType.WITH_TAGS &&
            tagsValue.length > 0
        ) {
            return explores.reduce<string[]>(
                (acc, { name, tags }) =>
                    hasIntersection(tags || [], tagsValue)
                        ? [...acc, name]
                        : acc,
                [],
            );
        }
        return [];
    }, [form.values, explores]);

    const availableTags = useMemo<string[]>(
        () =>
            Array.from(
                (explores || []).reduce<Set<string>>((acc, explore) => {
                    (explore.tags || []).forEach((tag) => acc.add(tag));
                    return acc;
                }, new Set()),
            ),
        [explores],
    );
    const { setFieldValue } = form;
    useEffect(() => {
        if (data) {
            setFieldValue('type', data.tableSelection.type);
            setFieldValue(
                'tags',
                data.tableSelection.type === TableSelectionType.WITH_TAGS &&
                    data.tableSelection.value
                    ? data.tableSelection.value
                    : [],
            );
            setFieldValue(
                'names',
                data.tableSelection.type === TableSelectionType.WITH_NAMES &&
                    data.tableSelection.value
                    ? data.tableSelection.value
                    : [],
            );
        }
    }, [setFieldValue, data]);

    useEffect(() => {
        if (isSuccess && onSuccess) {
            onSuccess();
        }
    }, [isSuccess, onSuccess]);

    const handleSubmit = form.onSubmit(async (formData: FormData) => {
        track({
            name: EventName.UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED,
        });
        let value: string[] | null = null;
        if (
            formData.type === TableSelectionType.WITH_TAGS &&
            formData.tags.length > 0
        ) {
            value = formData.tags;
        }
        if (
            formData.type === TableSelectionType.WITH_NAMES &&
            formData.names.length > 0
        ) {
            value = formData.names;
        }
        update({
            tableSelection: {
                type: formData.type,
                value,
            },
        });
    });

    return (
        <form name="project_table_configuration" onSubmit={handleSubmit}>
            <SettingsGridCard>
                <div>
                    <Title order={5}>Table selection</Title>
                    <Text color="gray.6" my={'xs'}>
                        You have selected <b>{modelsIncluded.length}</b> models{' '}
                        {modelsIncluded.length > 0 && (
                            <Anchor
                                size="sm"
                                component="button"
                                onClick={toggleList}
                            >
                                ({isListOpen ? 'hide' : 'show'} list)
                            </Anchor>
                        )}
                    </Text>
                    <Collapse in={isListOpen}>
                        <ScrollArea h={180}>
                            {modelsIncluded.map((name) => (
                                <Text
                                    key={name}
                                    title={name}
                                    truncate
                                    color="gray.6"
                                >
                                    {name}
                                </Text>
                            ))}
                        </ScrollArea>
                    </Collapse>
                </div>

                <div>
                    <Radio.Group
                        name="type"
                        label="Table selection"
                        withAsterisk
                        {...form.getInputProps('type')}
                    >
                        <Stack mt={'md'} spacing={'md'}>
                            <Radio
                                value={TableSelectionType.ALL}
                                label="Show entire project"
                                description="Show all of the models in your dbt project in Lightdash."
                            />
                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_TAGS}
                                    label={
                                        <>
                                            Show models with any of these tags{' '}
                                            <DocumentationHelpButton href="https://docs.getdbt.com/reference/resource-configs/tags#examples" />
                                        </>
                                    }
                                    description="Write a list of tags you want to include, separated
                                    by commas."
                                />
                                {form.values.type ===
                                    TableSelectionType.WITH_TAGS && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="tags"
                                        label="Tags"
                                        required
                                        data={availableTags}
                                        disabled={
                                            disabled ||
                                            availableTags.length === 0
                                        }
                                        placeholder="e.g lightdash, prod"
                                        {...form.getInputProps('tags')}
                                        error={
                                            availableTags.length === 0
                                                ? 'Your dbt project has no tags available'
                                                : undefined
                                        }
                                    />
                                )}
                            </Box>
                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_NAMES}
                                    label="Show models in this list"
                                    description="Write a list of models you want to include,
                                    separated by commas."
                                />
                                {form.values.type ===
                                    TableSelectionType.WITH_NAMES && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="names"
                                        label="Names"
                                        required
                                        data={(explores || []).map(
                                            ({ name }) => name,
                                        )}
                                        disabled={disabled}
                                        placeholder="e.g users, orders"
                                        {...form.getInputProps('names')}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </Radio.Group>

                    {canUpdateTableConfiguration && (
                        <Button
                            mt={'xl'}
                            type="submit"
                            loading={isSaving}
                            disabled={disabled}
                            sx={{ float: 'right' }}
                        >
                            Save changes
                        </Button>
                    )}
                </div>
            </SettingsGridCard>
        </form>
    );
};

export default ProjectTablesConfiguration;
