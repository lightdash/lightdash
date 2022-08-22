import { Classes, Collapse, H5, Intent, Radio, Text } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { hasIntersection, TableSelectionType } from '@lightdash/common';
import { FC, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import DocumentationHelpButton from '../DocumentationHelpButton';
import Form from '../ReactHookForm/Form';
import MultiSelect from '../ReactHookForm/MultiSelect';
import RadioGroup from '../ReactHookForm/RadioGroup';
import {
    CardWrapper,
    LeftPanel,
    ListTrigger,
    ListWrapper,
    RightPanel,
    SaveButton,
    TextP,
} from './ProjectTablesConfiguration.styles';

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

    const { data: explores, isLoading: isLoadingExplores } = useExplores();
    const { data, isLoading } = useProjectTablesConfiguration(projectUuid);
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
        isLoading ||
        isSaving ||
        isLoadingExplores ||
        !canUpdateTableConfiguration;
    const methods = useForm<FormData>({
        defaultValues: {
            type: TableSelectionType.ALL,
            tags: [],
            names: [],
        },
    });
    const typeValue = methods.watch('type', TableSelectionType.ALL);
    const tagsValue = methods.watch('tags', []);
    const namesValue = methods.watch('names', []);

    const modelsIncluded = useMemo<string[]>(() => {
        if (!explores) {
            return [];
        }
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
    }, [tagsValue, namesValue, typeValue, explores]);

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

    useEffect(() => {
        if (data) {
            methods.setValue('type', data.tableSelection.type);
            methods.setValue(
                'tags',
                data.tableSelection.type === TableSelectionType.WITH_TAGS &&
                    data.tableSelection.value
                    ? data.tableSelection.value
                    : [],
            );
            methods.setValue(
                'names',
                data.tableSelection.type === TableSelectionType.WITH_NAMES &&
                    data.tableSelection.value
                    ? data.tableSelection.value
                    : [],
            );
        }
    }, [methods, data]);

    useEffect(() => {
        if (isSuccess && onSuccess) {
            onSuccess();
        }
    }, [isSuccess, onSuccess]);

    const onSubmit = async (formData: FormData) => {
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
    };

    return (
        <Form
            name="project_table_configuration"
            methods={methods}
            onSubmit={onSubmit}
            disableSubmitOnEnter
        >
            <CardWrapper elevation={1}>
                <LeftPanel>
                    <H5>Table selection</H5>
                    <TextP>
                        You have selected <b>{modelsIncluded.length}</b> models{' '}
                        {modelsIncluded.length > 0 && (
                            <ListTrigger
                                role="button"
                                tabIndex={0}
                                onClick={toggleList}
                            >
                                ({isListOpen ? 'hide' : 'show'} list)
                            </ListTrigger>
                        )}
                    </TextP>
                    <Collapse isOpen={isListOpen}>
                        <ListWrapper className={Classes.ELEVATION_0}>
                            {modelsIncluded.map((name) => (
                                <Text title={name} ellipsize>
                                    {name}
                                </Text>
                            ))}
                        </ListWrapper>
                    </Collapse>
                </LeftPanel>
                <RightPanel>
                    <RadioGroup
                        name="type"
                        label="Table selection"
                        rules={{
                            required: 'Required field',
                        }}
                        disabled={disabled}
                        defaultValue={TableSelectionType.ALL}
                    >
                        <Radio
                            label="Show entire project"
                            value={TableSelectionType.ALL}
                        />
                        <TextP>
                            Show all of the models in your dbt project in
                            Lightdash.
                        </TextP>
                        <Radio
                            labelElement={
                                <>
                                    Show models with any of these tags{' '}
                                    <DocumentationHelpButton url="https://docs.getdbt.com/reference/resource-configs/tags#examples" />
                                </>
                            }
                            value={TableSelectionType.WITH_TAGS}
                        />
                        <TextP>
                            Write a list of tags you want to include, separated
                            by commas.
                        </TextP>
                        {typeValue === TableSelectionType.WITH_TAGS && (
                            <MultiSelect
                                name="tags"
                                label="Tags"
                                rules={{
                                    required: 'Required field',
                                }}
                                items={availableTags}
                                disabled={disabled}
                                placeholder="e.g lightdash, prod"
                            />
                        )}

                        <Radio
                            label="Show models in this list"
                            value={TableSelectionType.WITH_NAMES}
                        />
                        <TextP>
                            Write a list of models you want to include,
                            separated by commas.
                        </TextP>
                        {typeValue === TableSelectionType.WITH_NAMES && (
                            <MultiSelect
                                name="names"
                                label="Names"
                                rules={{
                                    required: 'Required field',
                                }}
                                items={(explores || []).map(({ name }) => name)}
                                disabled={disabled}
                                placeholder="e.g users, orders"
                            />
                        )}
                    </RadioGroup>
                </RightPanel>
            </CardWrapper>
            {canUpdateTableConfiguration && (
                <SaveButton
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Start exploring!"
                    loading={isSaving}
                    disabled={disabled}
                />
            )}
        </Form>
    );
};

export default ProjectTablesConfiguration;
