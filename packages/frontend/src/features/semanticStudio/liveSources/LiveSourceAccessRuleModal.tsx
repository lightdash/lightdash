/**
 * Who can query a live data source, for the people who manage it: user
 * attribute conditions copied onto its explores, as warehouse explores set
 * `required_attributes` and `any_attributes`.
 */
import {
    matchesLiveSourceAccessRule,
    type LiveSourceAccessRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Loader,
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
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    useLiveSourceAccess,
    useUpdateLiveSourceAccess,
} from '../../externalConnections/hooks/useLiveSourceAccess';
import { type LiveSourceConnection } from './liveSourceRows';

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
        <Stack gap="xs">
            <div>
                <Text fz="sm" fw={500}>
                    {label}
                </Text>
                <Text fz="xs" c="dimmed">
                    {description}
                </Text>
            </div>
            {conditions.map((condition, index) => (
                <Group key={index} gap="xs" align="flex-start" wrap="nowrap">
                    <Select
                        aria-label={`${label}: attribute`}
                        placeholder="Attribute"
                        w={160}
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
                    <TagsInput
                        aria-label={`${label}: values`}
                        placeholder={
                            condition.values.length === 0
                                ? 'Values, then Enter'
                                : undefined
                        }
                        flex={1}
                        value={condition.values}
                        onChange={(values) => update(index, { values })}
                    />
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        mt={4}
                        aria-label="Remove condition"
                        onClick={() =>
                            onChange(conditions.filter((_, at) => at !== index))
                        }
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Group>
            ))}
            <Button
                size="xs"
                variant="subtle"
                color="gray"
                w="fit-content"
                leftSection={<MantineIcon icon={IconPlus} size={14} />}
                disabled={attributeNames.length === picked.size}
                onClick={() =>
                    onChange([...conditions, { name: null, values: [] }])
                }
            >
                Add condition
            </Button>
        </Stack>
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
    const [confirmLockOut, setConfirmLockOut] = useState(false);
    const { mutate, isLoading } = useUpdateLiveSourceAccess({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const next = toRule(conditions);
    const isEmpty =
        conditions.required.length === 0 && conditions.any.length === 0;
    const hasIncomplete = [...conditions.required, ...conditions.any].some(
        ({ name, values }) => !name || values.length === 0,
    );
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
            title="Who can query"
            icon={IconLock}
            size="lg"
            confirmLabel="Save"
            confirmDisabled={hasIncomplete}
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
            onConfirm={() =>
                matchesLiveSourceAccessRule(next, yourAttributes)
                    ? save()
                    : setConfirmLockOut(true)
            }
        >
            <Stack gap="md">
                <Text fz="sm" c="dimmed">
                    Who can query "{connection.name}", by user attribute. Charts
                    and agents on it follow the same rule.
                </Text>
                {attributeNames.length === 0 ? (
                    <Alert color="gray" variant="light">
                        This organization has no user attributes yet. An admin
                        adds them in organization settings.
                    </Alert>
                ) : null}
                {isEmpty ? (
                    <Text fz="sm">
                        Everyone in the project can query this integration.
                    </Text>
                ) : null}
                <ConditionList
                    label="Must match all"
                    description="Every attribute must have one of its values."
                    conditions={conditions.required}
                    attributeNames={attributeNames}
                    onChange={(required) =>
                        setConditions({ ...conditions, required })
                    }
                />
                <ConditionList
                    label="Must match any"
                    description="At least one attribute must have one of its values."
                    conditions={conditions.any}
                    attributeNames={attributeNames}
                    onChange={(any) => setConditions({ ...conditions, any })}
                />
            </Stack>
        </MantineModal>
    );
};

export const LiveSourceAccessRuleModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const { data: access } = useLiveSourceAccess({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    if (!access) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="Who can query"
                icon={IconLock}
            >
                <Group justify="center" p="md">
                    <Loader size="sm" />
                </Group>
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
