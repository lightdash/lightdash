import { subject } from '@casl/ability';
import { hasIntersection, TableSelectionType } from '@lightdash/common';
import {
    Box,
    Collapse,
    Flex,
    Loader,
    Stack,
    Text,
    Title,
    Button,
    Anchor,
    Highlight,
    MultiSelect,
    Radio,
    ScrollArea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { z } from 'zod';
import { useExplores } from '../../hooks/useExplores';
import {
    useProjectTablesConfiguration,
    useUpdateProjectTablesConfiguration,
} from '../../hooks/useProjectTablesConfiguration';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';

const validationSchema = z.object({
    type: z.enum(TableSelectionType),
    tags: z.array(z.string()),
    names: z.array(z.string()),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = {
    projectUuid: string;
    onSuccess?: () => void;
};

const ProjectTablesConfiguration: FC<Props> = ({ projectUuid, onSuccess }) => {
    const { t } = useTranslation('projectSettings');
    const { track } = useTracking();
    const { user } = useApp();
    const ability = useAbilityContext();
    const [isListOpen, toggleList] = useToggle(false);
    const [search, setSearch] = useState('');

    const { data: explores, isInitialLoading: isLoadingExplores } =
        useExplores(projectUuid);

    const { data: tablesConfig, isInitialLoading: isLoadingTablesConfig } =
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
        isLoadingTablesConfig ||
        isSaving ||
        isLoadingExplores ||
        !canUpdateTableConfiguration;

    const form = useForm<FormValues>({
        initialValues: {
            type: TableSelectionType.ALL,
            tags: [],
            names: [],
        },
        validate: zodResolver(validationSchema),
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

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const preserveSearchOnOptionSubmit = useCallback(() => {
        const submittedSearch = search;
        setTimeout(() => setSearch(submittedSearch), 0);
    }, [search]);

    useEffect(() => {
        if (!tablesConfig) return;

        const { type, value } = tablesConfig.tableSelection;

        const getValueBasedOnType = (selectionType: TableSelectionType) =>
            type === selectionType && value ? value : [];

        const initialValues = {
            type: type,
            tags: getValueBasedOnType(TableSelectionType.WITH_TAGS),
            names: getValueBasedOnType(TableSelectionType.WITH_NAMES),
        };

        form.setInitialValues(initialValues);
        form.setValues(initialValues);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tablesConfig]);

    useEffect(() => {
        if (isSuccess && onSuccess) {
            onSuccess();
        }
    }, [isSuccess, onSuccess]);

    const handleSubmit = form.onSubmit(async (formData) => {
        if (!form.isValid()) return;

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
                    <Title order={5}>{t('tablesConfiguration.title')}</Title>
                    <Text size="sm" c="dimmed" my={'xs'}>
                        <Trans
                            t={t}
                            i18nKey="tablesConfiguration.selectedModels"
                            count={modelsIncluded.length}
                            components={{ b: <b /> }}
                        />{' '}
                        {modelsIncluded.length > 0 && (
                            <Anchor
                                type="button"
                                size="sm"
                                component="button"
                                onClick={toggleList}
                            >
                                {isListOpen
                                    ? t('tablesConfiguration.hideList')
                                    : t('tablesConfiguration.showList')}
                            </Anchor>
                        )}
                    </Text>
                    <Collapse expanded={isListOpen}>
                        <ScrollArea h={180}>
                            {modelsIncluded.map((name) => (
                                <Text
                                    key={name}
                                    title={name}
                                    truncate
                                    size="sm"
                                    c="dimmed"
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
                        label={t('tablesConfiguration.title')}
                        withAsterisk
                        {...form.getInputProps('type')}
                    >
                        <Stack mt={'md'} gap={'md'}>
                            <Radio
                                value={TableSelectionType.ALL}
                                label={t('tablesConfiguration.all.label')}
                                description={t(
                                    'tablesConfiguration.all.description',
                                )}
                                disabled={disabled}
                            />

                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_TAGS}
                                    label={
                                        <>
                                            {t(
                                                'tablesConfiguration.withTags.label',
                                            )}{' '}
                                            <DocumentationHelpButton href="https://docs.getdbt.com/reference/resource-configs/tags#examples" />
                                        </>
                                    }
                                    description={t(
                                        'tablesConfiguration.withTags.description',
                                    )}
                                    disabled={disabled}
                                />

                                {form.values.type ===
                                    TableSelectionType.WITH_TAGS && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="tags"
                                        label={t(
                                            'tablesConfiguration.withTags.tags',
                                        )}
                                        required
                                        data={availableTags}
                                        disabled={
                                            disabled ||
                                            availableTags.length === 0
                                        }
                                        placeholder={t(
                                            'tablesConfiguration.withTags.placeholder',
                                        )}
                                        searchable
                                        maxDropdownHeight={220}
                                        hidePickedOptions
                                        searchValue={search}
                                        onSearchChange={setSearch}
                                        onOptionSubmit={
                                            preserveSearchOnOptionSubmit
                                        }
                                        renderOption={({ option }) =>
                                            option.disabled ? (
                                                <Text c="dimmed">
                                                    {option.label}
                                                </Text>
                                            ) : (
                                                <Highlight
                                                    highlight={search}
                                                    fz="sm"
                                                >
                                                    {option.label}
                                                </Highlight>
                                            )
                                        }
                                        nothingFoundMessage={
                                            isLoadingTablesConfig
                                                ? t(
                                                      'tablesConfiguration.loading',
                                                  )
                                                : t(
                                                      'tablesConfiguration.noResults',
                                                  )
                                        }
                                        rightSection={
                                            isLoadingTablesConfig ? (
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                            ) : null
                                        }
                                        onDropdownClose={() => {
                                            handleResetSearch();
                                        }}
                                        {...form.getInputProps('tags')}
                                        error={
                                            availableTags.length === 0
                                                ? t(
                                                      'tablesConfiguration.withTags.noTags',
                                                  )
                                                : undefined
                                        }
                                    />
                                )}
                            </Box>
                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_NAMES}
                                    label={t(
                                        'tablesConfiguration.withNames.label',
                                    )}
                                    description={t(
                                        'tablesConfiguration.withNames.description',
                                    )}
                                    disabled={disabled}
                                />

                                {form.values.type ===
                                    TableSelectionType.WITH_NAMES && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="names"
                                        label={t(
                                            'tablesConfiguration.withNames.names',
                                        )}
                                        required
                                        data={(explores || []).map(
                                            ({ name }) => name,
                                        )}
                                        disabled={disabled}
                                        placeholder={t(
                                            'tablesConfiguration.withNames.placeholder',
                                        )}
                                        searchable
                                        maxDropdownHeight={220}
                                        hidePickedOptions
                                        searchValue={search}
                                        onSearchChange={setSearch}
                                        onOptionSubmit={
                                            preserveSearchOnOptionSubmit
                                        }
                                        renderOption={({ option }) =>
                                            option.disabled ? (
                                                <Text c="dimmed">
                                                    {option.label}
                                                </Text>
                                            ) : (
                                                <Highlight
                                                    highlight={search}
                                                    fz="sm"
                                                >
                                                    {option.label}
                                                </Highlight>
                                            )
                                        }
                                        nothingFoundMessage={
                                            isLoadingTablesConfig
                                                ? t(
                                                      'tablesConfiguration.loading',
                                                  )
                                                : t(
                                                      'tablesConfiguration.noResults',
                                                  )
                                        }
                                        rightSection={
                                            isLoadingTablesConfig ? (
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                            ) : null
                                        }
                                        onDropdownClose={() => {
                                            handleResetSearch();
                                        }}
                                        {...form.getInputProps('names')}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </Radio.Group>

                    {canUpdateTableConfiguration && (
                        <Flex justify="flex-end" gap="sm" mt="xl">
                            {form.isDirty() && !disabled && (
                                <Button
                                    variant="outline"
                                    onClick={() => form.reset()}
                                >
                                    {t('actions.cancel', { ns: 'common' })}
                                </Button>
                            )}

                            <Button
                                type="submit"
                                loading={isSaving}
                                disabled={disabled}
                            >
                                {t('tablesConfiguration.saveChanges')}
                            </Button>
                        </Flex>
                    )}
                </div>
            </SettingsGridCard>
        </form>
    );
};

export default ProjectTablesConfiguration;
