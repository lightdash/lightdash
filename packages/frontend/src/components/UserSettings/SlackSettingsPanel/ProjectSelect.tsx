import { ProjectType } from '@lightdash/common';
import {
    Combobox,
    Input,
    Pill,
    PillsInput,
    Tooltip,
    useCombobox,
} from '@mantine-8/core';
import { useMemo, useState, type FC } from 'react';
import { useProjects } from '../../../hooks/useProjects';

type ProjectSelectProps = {
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
};

export const ProjectSelect: FC<ProjectSelectProps> = ({
    value,
    onChange,
    disabled,
}) => {
    const { data: projects } = useProjects();
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
        onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
    });
    const [search, setSearch] = useState('');

    const projectOptions = useMemo(
        () =>
            projects
                ?.filter((p) => p.type === ProjectType.DEFAULT)
                .map((p) => ({
                    value: p.projectUuid,
                    label: p.name,
                })) ?? [],
        [projects],
    );

    const isDeleted = (uuid: string) =>
        !projects?.some((p) => p.projectUuid === uuid);

    const getLabel = (uuid: string) => {
        const project = projects?.find((p) => p.projectUuid === uuid);
        return project?.name ?? 'Deleted project';
    };

    const handleValueSelect = (val: string) => {
        if (value.includes(val)) {
            onChange(value.filter((v) => v !== val));
        } else {
            onChange([...value, val]);
        }
    };

    const handleValueRemove = (val: string) => {
        onChange(value.filter((v) => v !== val));
    };

    const filteredOptions = projectOptions.filter(
        (item) =>
            !value.includes(item.value) &&
            item.label.toLowerCase().includes(search.toLowerCase().trim()),
    );

    const pills = value.map((uuid) => {
        const deleted = isDeleted(uuid);
        const label = getLabel(uuid);

        const pill = (
            <Pill
                key={uuid}
                withRemoveButton
                onRemove={() => handleValueRemove(uuid)}
                bg={deleted ? 'red.1' : undefined}
                c={deleted ? 'red.7' : undefined}
            >
                {label}
            </Pill>
        );

        if (deleted) {
            return (
                <Tooltip
                    key={uuid}
                    label="This project has been deleted"
                    withArrow
                >
                    {pill}
                </Tooltip>
            );
        }

        return pill;
    });

    return (
        <Input.Wrapper label="Filter agents by project" size="xs">
            <Combobox
                store={combobox}
                onOptionSubmit={handleValueSelect}
                disabled={disabled}
            >
                <Combobox.DropdownTarget>
                    <PillsInput
                        size="xs"
                        onClick={() => combobox.openDropdown()}
                        disabled={disabled}
                    >
                        <Pill.Group>
                            {pills}
                            <Combobox.EventsTarget>
                                <PillsInput.Field
                                    onFocus={() => combobox.openDropdown()}
                                    onBlur={() => combobox.closeDropdown()}
                                    value={search}
                                    placeholder="Select projects"
                                    onChange={(event) => {
                                        combobox.updateSelectedOptionIndex();
                                        setSearch(event.currentTarget.value);
                                    }}
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === 'Backspace' &&
                                            search.length === 0
                                        ) {
                                            event.preventDefault();
                                            handleValueRemove(
                                                value[value.length - 1],
                                            );
                                        }
                                    }}
                                    disabled={disabled}
                                />
                            </Combobox.EventsTarget>
                        </Pill.Group>
                    </PillsInput>
                </Combobox.DropdownTarget>

                <Combobox.Dropdown>
                    <Combobox.Options>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((item) => (
                                <Combobox.Option
                                    value={item.value}
                                    key={item.value}
                                    active={value.includes(item.value)}
                                >
                                    {item.label}
                                </Combobox.Option>
                            ))
                        ) : (
                            <Combobox.Empty>No projects found</Combobox.Empty>
                        )}
                    </Combobox.Options>
                </Combobox.Dropdown>
            </Combobox>
        </Input.Wrapper>
    );
};
