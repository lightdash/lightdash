import {
    Button,
    Combobox,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    useCombobox,
} from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    getChoiceKey,
    getControlChoices,
    getControlChoiceGroups,
    type ControlChoice,
} from './choice';
import { useDashboardControls, type ControlModel } from './context';
import { type ControlDraft } from './controlDraft';
import ControlItemIcon from './ControlItemIcon';
import { getControlTypeWord, getParameterTypeForControl } from './controlType';
import classes from './dashboardControls.module.css';
import ItemLabel from './ItemLabel';
import { formatTileCount } from './tiles';

const NO_CHOICES = { options: [], items: {} };

// A new control's first step: one question, answered from one list of the
// fields and parameters of its type. The answer decides what kind it is.
const ControlChoiceStep: FC<{ draft: ControlDraft; model: ControlModel }> = ({
    draft,
    model,
}) => {
    const getUiString = useUiStrings();
    const {
        choose,
        cancel,
        choiceParameterModel,
        draftsTemporaryFilters,
        isGuardNoticeShown,
    } = useDashboardControls();
    const [search, setSearch] = useState('');
    // The list is always showing: the store is open so the keyboard reaches it
    const combobox = useCombobox({ opened: true });

    const typeWord = getControlTypeWord(draft.controlType);
    const choices = useMemo(
        () =>
            getControlChoices({
                fields: { options: model.overview.others, items: model.items },
                parameters: choiceParameterModel
                    ? {
                          options: choiceParameterModel.overview.others,
                          items: choiceParameterModel.items,
                      }
                    : NO_CHOICES,
            }),
        [model, choiceParameterModel],
    );
    const isLoading = model.isLoading || !!choiceParameterModel?.isLoading;
    // Nothing is listed until fields and parameters are both in: rows that
    // arrive later would move under the pointer
    const groups = isLoading ? [] : getControlChoiceGroups(choices, search);
    // The first match in the order the list shows them
    const firstShown = groups[0]?.choices[0];
    const firstShownKey = firstShown ? getChoiceKey(firstShown) : null;
    // Enter takes the first match
    useEffect(() => {
        combobox.selectFirstOption();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is new on every render
    }, [firstShownKey]);
    // A type no parameter has, as time, lists fields only while editing too
    const hasParameters =
        getParameterTypeForControl(draft.controlType) !== null;
    const getPlaceholder = (): string => {
        if (draftsTemporaryFilters) {
            return getUiString('filters.config.searchFieldPlaceholder');
        }
        return hasParameters
            ? `Search ${typeWord} fields and parameters`
            : `Search ${typeWord} fields`;
    };
    const placeholder = getPlaceholder();

    const renderIcon = (choice: ControlChoice) => {
        if (choice.kind === 'parameter') {
            return (
                <MantineIcon
                    icon={IconAdjustmentsHorizontal}
                    color="dimmed"
                    size="sm"
                />
            );
        }
        return <ControlItemIcon model={model} id={choice.id} />;
    };

    const renderOption = (choice: ControlChoice) => (
        <Combobox.Option
            key={getChoiceKey(choice)}
            value={getChoiceKey(choice)}
        >
            <Group gap="xs" wrap="nowrap">
                {renderIcon(choice)}
                <Text fz="xs" truncate flex={1}>
                    <ItemLabel display={choice.display} />
                </Text>
                <Text fz="xs" c="dimmed" className={classes.choiceCount}>
                    {formatTileCount(choice.tileCount)}
                </Text>
            </Group>
        </Combobox.Option>
    );

    return (
        <Stack gap="sm" w="min(500px, calc(100vw - 56px))">
            <Group gap="xs" wrap="nowrap">
                <Text fz="sm" fw={600}>
                    Select what to control
                </Text>
                {isLoading && <Loader size="xs" />}
            </Group>
            <Combobox
                store={combobox}
                onOptionSubmit={(key) => {
                    const choice = choices.find(
                        (item) => getChoiceKey(item) === key,
                    );
                    if (choice) choose(choice.kind, choice.id);
                }}
            >
                <Combobox.EventsTarget>
                    <TextInput
                        size="xs"
                        data-autofocus
                        aria-label={placeholder}
                        placeholder={placeholder}
                        value={search}
                        onChange={(event) => {
                            setSearch(event.currentTarget.value);
                        }}
                    />
                </Combobox.EventsTarget>
                {!isLoading && (
                    <ScrollArea.Autosize
                        mah={240}
                        type="auto"
                        className={classes.choiceList}
                    >
                        <Combobox.Options>
                            {groups.length === 0 && (
                                <Combobox.Empty>
                                    {getUiString(
                                        'filters.config.noMatchingFields',
                                    )}
                                </Combobox.Empty>
                            )}
                            {groups.map(({ heading, choices: listed }) =>
                                heading === null ? (
                                    listed.map(renderOption)
                                ) : (
                                    <Combobox.Group
                                        key={heading}
                                        label={heading}
                                    >
                                        {listed.map(renderOption)}
                                    </Combobox.Group>
                                ),
                            )}
                        </Combobox.Options>
                    </ScrollArea.Autosize>
                )}
            </Combobox>
            <Group gap="xs" justify="flex-end">
                {isGuardNoticeShown && (
                    <Text fz="xs" c="dimmed" mr="auto" aria-live="polite">
                        Apply or cancel first
                    </Text>
                )}
                <Button size="xs" variant="default" onClick={cancel}>
                    Cancel
                </Button>
            </Group>
        </Stack>
    );
};

export default ControlChoiceStep;
