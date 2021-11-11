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
} from '@blueprintjs/core';
import { useForm } from 'react-hook-form';
import { friendlyName, TableSelectionType } from 'common';
import { useTracking } from '../../providers/TrackingProvider';
import Form from '../ReactHookForm/Form';
import RadioGroup from '../ReactHookForm/RadioGroup';
import { EventName } from '../../types/Events';
import {
    useProjectTablesConfiguration,
    useUpdateProjectTablesConfiguration,
} from '../../hooks/useProjectTablesConfiguration';
import DocumentationHelpButton from '../DocumentationHelpButton';
import TagInput from '../ReactHookForm/TagInput';
import { useExplores } from '../../hooks/useExplores';

type FormData = {
    type: TableSelectionType;
    tags: string[];
    names: string[];
};

const hasCompatibleTags = (tags: string[], tags2: string[]): boolean => {
    const intersection = tags.filter((value) => tags2.includes(value));
    return intersection.length > 0;
};

const ProjectTablesConfiguration: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { track } = useTracking();
    const { data: explores } = useExplores();
    const { data, isLoading } = useProjectTablesConfiguration(projectUuid);
    const updateHook = useUpdateProjectTablesConfiguration(projectUuid);
    const disabled = isLoading || updateHook.isLoading;
    const methods = useForm<FormData>({
        defaultValues: {
            type: TableSelectionType.ALL,
            tags: [],
            names: [],
        },
    });
    const typeValue = methods.watch('type', TableSelectionType.ALL);
    const tagsValue = methods.watch('tags', []);

    const modelsIncluded = useMemo<string[]>(() => {
        if (explores && tagsValue.length > 0) {
            return explores.reduce<string[]>(
                (acc, { name, tags }) =>
                    hasCompatibleTags(tags || [], tagsValue)
                        ? [...acc, name]
                        : acc,
                [],
            );
        }
        return [];
    }, [tagsValue, explores]);

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
        updateHook.mutate({
            tableSelection: {
                type: formData.type,
                value,
            },
        });
    };

    return (
        <Form methods={methods} onSubmit={onSubmit}>
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <div style={{ flex: 1 }}>
                    <H5 style={{ display: 'inline', marginRight: 5 }}>
                        Table selection
                    </H5>
                </div>
                <div style={{ flex: 1 }}>
                    <RadioGroup
                        name="type"
                        label="Table Selection"
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
                            <>
                                <TagInput
                                    name="tags"
                                    label="Tags"
                                    rules={{
                                        required: 'Required field',
                                    }}
                                    disabled={disabled}
                                    placeholder="e.g lightdash, prod"
                                />

                                <div
                                    style={{
                                        color: Colors.GRAY1,
                                        display: 'flex',
                                        alignItems: 'center',
                                    }}
                                >
                                    <span>
                                        Detected {modelsIncluded.length} models
                                        included
                                    </span>
                                    <Button
                                        small
                                        icon="refresh"
                                        style={{ marginLeft: 10 }}
                                    />
                                </div>
                                <Collapse isOpen={modelsIncluded.length > 0}>
                                    <div
                                        style={{
                                            marginTop: 10,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 5,
                                            padding: 10,
                                            color: Colors.GRAY1,
                                            maxHeight: 100,
                                            overflow: 'auto',
                                        }}
                                        className={Classes.ELEVATION_0}
                                    >
                                        {modelsIncluded.map((name) => (
                                            <span>{friendlyName(name)}</span>
                                        ))}
                                    </div>
                                </Collapse>
                            </>
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
                            <TagInput
                                name="names"
                                label="Names"
                                rules={{
                                    required: 'Required field',
                                }}
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
                loading={updateHook.isLoading}
                disabled={disabled}
                style={{ float: 'right' }}
            />
        </Form>
    );
};

export default ProjectTablesConfiguration;
