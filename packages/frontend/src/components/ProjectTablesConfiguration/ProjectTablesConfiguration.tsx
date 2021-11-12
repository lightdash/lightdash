import React, { FC, useEffect, useMemo } from 'react';
import {
    Button,
    Card,
    Collapse,
    Colors,
    H5,
    Intent,
    Radio,
    Classes,
    Text,
} from '@blueprintjs/core';
import { useForm } from 'react-hook-form';
import { hasIntersection, TableSelectionType } from 'common';
import { useToggle } from 'react-use';
import { useTracking } from '../../providers/TrackingProvider';
import Form from '../ReactHookForm/Form';
import RadioGroup from '../ReactHookForm/RadioGroup';
import { EventName } from '../../types/Events';
import {
    useProjectTablesConfiguration,
    useUpdateProjectTablesConfiguration,
} from '../../hooks/useProjectTablesConfiguration';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { useExplores } from '../../hooks/useExplores';
import MultiSelect from '../ReactHookForm/MultiSelect';

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
    const [isListOpen, toggleList] = useToggle(false);

    const { data: explores, isLoading: isLoadingExplores } = useExplores();
    const { data, isLoading } = useProjectTablesConfiguration(projectUuid);
    const {
        mutate: update,
        isLoading: isSaving,
        isSuccess,
    } = useUpdateProjectTablesConfiguration(projectUuid);
    const disabled = isLoading || isSaving || isLoadingExplores;
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
        <Form methods={methods} onSubmit={onSubmit} disableSubmitOnEnter>
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <div style={{ flex: 1, width: '50%', paddingRight: 20 }}>
                    <H5>Table selection</H5>
                    <p style={{ color: Colors.GRAY1 }}>
                        You have selected <b>{modelsIncluded.length}</b> models{' '}
                        {modelsIncluded.length > 0 && (
                            <b
                                role="button"
                                tabIndex={0}
                                onClick={toggleList}
                                style={{ cursor: 'pointer' }}
                            >
                                ({isListOpen ? 'hide' : 'show'} list)
                            </b>
                        )}
                    </p>
                    <Collapse isOpen={isListOpen}>
                        <div
                            style={{
                                padding: 10,
                                color: Colors.GRAY1,
                                maxHeight: 270,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                            }}
                            className={Classes.ELEVATION_0}
                        >
                            {modelsIncluded.map((name) => (
                                <Text title={name} ellipsize>
                                    {name}
                                </Text>
                            ))}
                        </div>
                    </Collapse>
                </div>
                <div style={{ flex: 1, width: '50%' }}>
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
                        <p style={{ color: Colors.GRAY1 }}>
                            Show all of the models in your dbt project in
                            Lightdash.
                        </p>
                        <Radio
                            style={{ marginTop: 20 }}
                            labelElement={
                                <>
                                    Show models with any of these tags{' '}
                                    <DocumentationHelpButton url="https://docs.getdbt.com/reference/resource-configs/tags#examples" />
                                </>
                            }
                            value={TableSelectionType.WITH_TAGS}
                        />
                        <p style={{ color: Colors.GRAY1 }}>
                            Write a list of tags you want to include, separated
                            by commands.
                        </p>
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
                            style={{ marginTop: 20 }}
                            label="Show models in this list"
                            value={TableSelectionType.WITH_NAMES}
                        />
                        <p style={{ color: Colors.GRAY1 }}>
                            Write a list of models you want to include,
                            separated by commas.
                        </p>
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
                </div>
            </Card>
            <Button
                type="submit"
                intent={Intent.PRIMARY}
                text="Save"
                loading={isSaving}
                disabled={disabled}
                style={{ float: 'right' }}
            />
        </Form>
    );
};

export default ProjectTablesConfiguration;
