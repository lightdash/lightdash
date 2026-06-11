import {
    type OrganizationSettings,
    type UpdateOrganizationSettings,
    getCorsWildcardOriginRegexSource,
    isCorsWildcardOrigin,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import {
    type CorsAllowedDomainInput,
    type CorsAllowedDomainInputType,
    getInitialCorsAllowedDomainsInput,
    getRegexPatternInput,
    normalizeCorsAllowedDomainsInput,
    validateCorsAllowedDomainsInput,
} from './utils';

type FormValues = {
    corsAllowedDomains: CorsAllowedDomainInput[];
};

const newCorsAllowedDomainInput = (
    type: CorsAllowedDomainInputType = 'origin',
): CorsAllowedDomainInput => ({
    type,
    value: '',
});

const getNextInputValue = (
    input: CorsAllowedDomainInput,
    type: CorsAllowedDomainInputType,
) => {
    if (type === 'regex' && isCorsWildcardOrigin(input.value)) {
        const regexSource = getCorsWildcardOriginRegexSource(input.value);
        return regexSource
            ? getRegexPatternInput(`/${regexSource}/`)
            : input.value;
    }

    return input.value;
};

const CorsSettingsForm: FC<{ settings: OrganizationSettings }> = ({
    settings,
}) => {
    const update = useUpdateOrganizationSettings();

    const initial = {
        corsAllowedDomains: getInitialCorsAllowedDomainsInput(
            settings.corsAllowedDomains ?? [],
        ),
    };
    const initialAllowedDomains = normalizeCorsAllowedDomainsInput(
        initial.corsAllowedDomains,
    );

    const form = useForm<FormValues>({
        initialValues: initial,
        validate: (values) =>
            validateCorsAllowedDomainsInput(values.corsAllowedDomains),
    });

    const currentAllowedDomains = normalizeCorsAllowedDomainsInput(
        form.values.corsAllowedDomains,
    );
    const isUnchanged = isEqual(currentAllowedDomains, initialAllowedDomains);

    const handleSubmit = form.onSubmit((values) => {
        const patch: UpdateOrganizationSettings = {
            corsAllowedDomains: normalizeCorsAllowedDomainsInput(
                values.corsAllowedDomains,
            ),
        };
        update.mutate(patch);
    });

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="lg">
                <Stack gap="xs">
                    {form.values.corsAllowedDomains.map((input, index) => {
                        const fieldPath = `corsAllowedDomains.${index}.value`;
                        const isRegex = input.type === 'regex';
                        return (
                            <Group
                                key={index}
                                gap="xs"
                                align="flex-end"
                                wrap="nowrap"
                            >
                                <TextInput
                                    w="100%"
                                    label={
                                        index === 0 ? 'Allowed origins' : null
                                    }
                                    description={
                                        index === 0
                                            ? 'Origin mode accepts exact origins or *.example.com. Regex mode (.*) accepts a pattern and matches the whole origin automatically.'
                                            : null
                                    }
                                    placeholder={
                                        isRegex
                                            ? 'https:\\/\\/.*\\.example\\.com'
                                            : 'https://app.example.com or *.example.com'
                                    }
                                    rightSectionWidth={44}
                                    rightSection={
                                        <Tooltip
                                            withinPortal
                                            label={
                                                isRegex
                                                    ? 'Switch to origin mode'
                                                    : 'Switch to regex mode'
                                            }
                                        >
                                            <ActionIcon
                                                type="button"
                                                size="sm"
                                                variant={
                                                    isRegex ? 'light' : 'subtle'
                                                }
                                                color={
                                                    isRegex ? 'blue' : 'gray'
                                                }
                                                aria-label={
                                                    isRegex
                                                        ? 'Switch to origin mode'
                                                        : 'Switch to regex mode'
                                                }
                                                onClick={() => {
                                                    const type: CorsAllowedDomainInputType =
                                                        isRegex
                                                            ? 'origin'
                                                            : 'regex';
                                                    form.setFieldValue(
                                                        `corsAllowedDomains.${index}`,
                                                        {
                                                            ...input,
                                                            type,
                                                            value: getNextInputValue(
                                                                input,
                                                                type,
                                                            ),
                                                        },
                                                    );
                                                }}
                                            >
                                                {isRegex ? '.*' : 'Aa'}
                                            </ActionIcon>
                                        </Tooltip>
                                    }
                                    {...form.getInputProps(fieldPath)}
                                />
                                <ActionIcon
                                    type="button"
                                    variant="subtle"
                                    color="red"
                                    mb={form.errors[fieldPath] ? 'xl' : 0}
                                    aria-label="Remove CORS origin"
                                    onClick={() =>
                                        form.removeListItem(
                                            'corsAllowedDomains',
                                            index,
                                        )
                                    }
                                >
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        );
                    })}
                    {form.values.corsAllowedDomains.length === 0 && (
                        <Text c="ldGray.6" fz="sm">
                            No CORS origins configured.
                        </Text>
                    )}
                    <Group justify="flex-start">
                        <Button
                            type="button"
                            variant="subtle"
                            leftSection={<IconPlus size={16} />}
                            onClick={() =>
                                form.insertListItem(
                                    'corsAllowedDomains',
                                    newCorsAllowedDomainInput(),
                                )
                            }
                        >
                            Add origin
                        </Button>
                    </Group>
                </Stack>
                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={update.isLoading}
                        disabled={isUnchanged}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const CorsSettingsPanel: FC = () => {
    const { data, isInitialLoading } = useOrganizationSettings();

    if (isInitialLoading || !data) {
        return <Loader />;
    }

    return (
        <CorsSettingsForm
            key={(data.corsAllowedDomains ?? []).join(',')}
            settings={data}
        />
    );
};

export default CorsSettingsPanel;
