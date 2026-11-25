/**
 * Who can query a live data source, for the people who manage it: user
 * attribute conditions copied onto its explores, as warehouse explores set
 * `required_attributes` and `any_attributes`.
 */
import {
    EMPTY_LIVE_SOURCE_ACCESS_RULE,
    isLiveSourceAccessRuleEmpty,
    matchesLiveSourceAccessRule,
    type LiveSourceAccessRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    TagsInput,
    Text,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconLock,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    useLiveSourceAccess,
    useUpdateLiveSourceAccess,
} from '../hooks/useLiveSourceAccess';
import { type LiveSourceConnection } from './liveSourceRows';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import rowClasses from './LiveSourceSettingsRows.module.css';

type Condition = { name: string | null; values: string[] };
type Conditions = { required: Condition[]; any: Condition[] };

const toConditions = (rule: LiveSourceAccessRule): Conditions => ({
    required: Object.entries(rule.required).map(([name, values]) => ({
        name,
        values,
    })),
    any: Object.entries(rule.any).map(([name, values]) => ({ name, values })),
});

/** Conditions with no attribute picked are dropped. */
const toRule = (conditions: Conditions): LiveSourceAccessRule => {
    const toRecord = (list: Condition[]) =>
        Object.fromEntries(
            list.flatMap(({ name, values }) =>
                name ? [[name, values] as const] : [],
            ),
        );
    return {
        required: toRecord(conditions.required),
        any: toRecord(conditions.any),
    };
};

/** One group of conditions as a card: a row each, then a row to add another. */
const ConditionList: FC<{
    label: string;
    description: string;
    conditions: Condition[];
    attributeNames: string[];
    onChange: (conditions: Condition[]) => void;
}> = ({ label, description, conditions, attributeNames, onChange }) => {
    const update = (index: number, change: Partial<Condition>) =>
        onChange(
            conditions.map((condition, at) =>
                at === index ? { ...condition, ...change } : condition,
            ),
        );
    const picked = new Set(conditions.map(({ name }) => name));
    return (
        <SettingsCard title={label} titleOutside>
            {conditions.map((condition, index) => (
                <Box key={index} className={rowClasses.settingsRow}>
                    <Select
                        aria-label={`${label}: attribute`}
                        placeholder="Attribute"
                        size="xs"
                        w={220}
                        flex="none"
                        searchable
                        comboboxProps={{ withinPortal: true }}
                        value={condition.name}
                        data={[
                            ...(condition.name &&
                            !attributeNames.includes(condition.name)
                                ? [
                                      {
                                          value: condition.name,
                                          label: `${condition.name} (deleted)`,
                                      },
                                  ]
                                : []),
                            ...attributeNames.filter(
                                (name) =>
                                    name === condition.name ||
                                    !picked.has(name),
                            ),
                        ]}
                        onChange={(name) => update(index, { name })}
                    />
                    <Group gap="xs" wrap="nowrap" flex="none">
                        <TagsInput
                            aria-label={`${label}: values`}
                            placeholder={
                                condition.values.length === 0
                                    ? 'Values, then Enter'
                                    : undefined
                            }
                            size="xs"
                            w={320}
                            value={condition.values}
                            onChange={(values) => update(index, { values })}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Remove condition"
                            onClick={() =>
                                onChange(
                                    conditions.filter((_, at) => at !== index),
                                )
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                </Box>
            ))}
            <SettingsRow
                label={conditions.length === 0 ? 'No conditions' : null}
                hint={description}
            >
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    disabled={attributeNames.length === picked.size}
                    onClick={() =>
                        onChange([...conditions, { name: null, values: [] }])
                    }
                >
                    Add condition
                </Button>
            </SettingsRow>
        </SettingsCard>
    );
};

const AccessForm: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    rule: LiveSourceAccessRule;
    attributeNames: string[];
    yourAttributes: Record<string, string[]>;
    onClose: () => void;
}> = ({
    projectUuid,
    connection,
    rule,
    attributeNames,
    yourAttributes,
    onClose,
}) => {
    const [conditions, setConditions] = useState(() => toConditions(rule));
    /** Everyone keeps the conditions typed so far, in case it is switched back. */
    const [isRestricted, setIsRestricted] = useState(
        () => !isLiveSourceAccessRuleEmpty(rule),
    );
    const [confirmLockOut, setConfirmLockOut] = useState(false);
    const { mutate, isLoading } = useUpdateLiveSourceAccess({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const next = isRestricted
        ? toRule(conditions)
        : EMPTY_LIVE_SOURCE_ACCESS_RULE;
    const all = [...conditions.required, ...conditions.any];
    // Restricted needs a condition, and each one an attribute and a value
    const isIncomplete =
        isRestricted &&
        (all.length === 0 ||
            all.some(({ name, values }) => !name || values.length === 0));
    const save = () => mutate(next, { onSuccess: onClose });

    if (confirmLockOut) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="You'll lose query access to this integration"
                icon={IconAlertTriangle}
                size="md"
                description={`Your own user attributes don't match this rule, so you won't be able to query "${connection.name}". You can still change the rule later.`}
                confirmLabel="Save anyway"
                confirmLoading={isLoading}
                cancelLabel="Back"
                cancelDisabled={isLoading}
                onCancel={() => setConfirmLockOut(false)}
                onConfirm={save}
            />
        );
    }
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Edit access"
            icon={IconLock}
            size="xl"
            confirmLabel="Save changes"
            confirmDisabled={isIncomplete || isEqual(next, rule)}
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
            onConfirm={() =>
                matchesLiveSourceAccessRule(next, yourAttributes)
                    ? save()
                    : setConfirmLockOut(true)
            }
        >
            <Stack gap="lg">
                {/* One row needs no card: a rule under it sets it off from the conditions */}
                <Box
                    className={rowClasses.dialogLead}
                    data-ruled={isRestricted || undefined}
                >
                    <SettingsRow
                        label="Query access"
                        hint={
                            attributeNames.length === 0
                                ? 'Restricting needs user attributes, which an admin adds in organization settings'
                                : 'Open it to everyone or limit it by user attribute'
                        }
                    >
                        <SegmentedControl
                            size="xs"
                            w={320}
                            data={[
                                { value: 'everyone', label: 'Everyone' },
                                {
                                    value: 'restricted',
                                    label: 'Restricted',
                                    disabled: attributeNames.length === 0,
                                },
                            ]}
                            value={isRestricted ? 'restricted' : 'everyone'}
                            onChange={(value) =>
                                setIsRestricted(value === 'restricted')
                            }
                        />
                    </SettingsRow>
                </Box>
                {isRestricted ? (
                    <>
                        <ConditionList
                            label="Must match all"
                            description="Every one of these must be true"
                            conditions={conditions.required}
                            attributeNames={attributeNames}
                            onChange={(required) =>
                                setConditions({ ...conditions, required })
                            }
                        />
                        <ConditionList
                            label="Must match any"
                            description="At least one of these must be true"
                            conditions={conditions.any}
                            attributeNames={attributeNames}
                            onChange={(any) =>
                                setConditions({ ...conditions, any })
                            }
                        />
                    </>
                ) : null}
            </Stack>
        </MantineModal>
    );
};

export const LiveSourceAccessRuleModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const {
        data: access,
        error,
        refetch,
        isFetching,
    } = useLiveSourceAccess({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    if (!access) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="Edit access"
                icon={IconLock}
            >
                {error ? (
                    <Alert
                        color="red"
                        icon={<MantineIcon icon={IconAlertTriangle} />}
                        title="Couldn't load the access rule"
                    >
                        <Stack gap="xs" align="flex-start">
                            <Text fz="sm">{error.error.message}</Text>
                            <Button
                                size="xs"
                                variant="default"
                                loading={isFetching}
                                onClick={() => refetch()}
                            >
                                Try again
                            </Button>
                        </Stack>
                    </Alert>
                ) : (
                    <Group justify="center" p="md">
                        <Loader size="sm" />
                    </Group>
                )}
            </MantineModal>
        );
    }
    const { attributeNames, yourAttributes, ...rule } = access;
    return (
        <AccessForm
            projectUuid={projectUuid}
            connection={connection}
            rule={rule}
            attributeNames={attributeNames}
            yourAttributes={yourAttributes}
            onClose={onClose}
        />
    );
};
