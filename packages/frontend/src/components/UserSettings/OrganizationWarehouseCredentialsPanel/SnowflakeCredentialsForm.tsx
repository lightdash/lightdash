import {
    Anchor,
    Select,
    Stack,
    Switch,
    TextInput,
    Textarea,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { SnowflakeOAuthInput } from '../../common/Authentication/SnowflakeOAuthInput';
import FormCollapseButton from '../../ProjectConnection/FormCollapseButton';
import FormSection from '../../ProjectConnection/Inputs/FormSection';

type Props = {
    form: UseFormReturnType<any>;
    disabled: boolean;
    showName?: boolean;
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({ value: index.toString(), label: x }));

export const SnowflakeCredentialsForm: FC<Props> = ({
    form,
    disabled,
    showName = true,
    onAuthenticated,
}) => {
    const [isOpen, toggleOpen] = useToggle(false);

    return (
        <Stack spacing="xs">
            {showName && (
                <TextInput
                    required
                    size="xs"
                    label="Name"
                    disabled={disabled}
                    {...form.getInputProps('name')}
                />
            )}

            <Textarea
                size="xs"
                label="Description"
                placeholder="Optional description"
                disabled={disabled}
                {...form.getInputProps('description')}
            />

            <TextInput
                required
                size="xs"
                label="Account"
                placeholder="your-account"
                description="This is the Snowflake account identifier"
                disabled={disabled}
                {...form.getInputProps('credentials.account')}
            />

            <Select
                name="warehouse.authenticationType"
                {...form.getInputProps('warehouse.authenticationType')}
                // TODO: default value is not being recognized. private key is always being selected
                defaultValue={'SSO'}
                label="Authentication Type"
                description={
                    'Choose how to authenticate with your data warehouse.'
                }
                data={['SSO']}
                disabled={true}
            />
            <SnowflakeOAuthInput onAuthenticated={onAuthenticated} />

            <TextInput
                required
                size="xs"
                label="Database"
                placeholder="your-database"
                description="This is the database name"
                disabled={disabled}
                {...form.getInputProps('credentials.database')}
            />

            <TextInput
                required
                size="xs"
                label="Warehouse"
                placeholder="your-warehouse"
                description="This is the warehouse name"
                disabled={disabled}
                {...form.getInputProps('credentials.warehouse')}
            />

            <TextInput
                required
                size="xs"
                label="Schema"
                placeholder="your-schema"
                description="This is the schema name"
                disabled={disabled}
                {...form.getInputProps('credentials.schema')}
            />

            <FormSection isOpen={isOpen} name="advanced">
                <Stack spacing="xs" style={{ marginTop: '8px' }}>
                    <Switch
                        size="xs"
                        label="Always use this warehouse"
                        description="When enabled, this warehouse will always be used for queries"
                        disabled={disabled}
                        {...form.getInputProps('credentials.override', {
                            type: 'checkbox',
                        })}
                    />

                    <Switch
                        size="xs"
                        label="Require users to provide their own credentials"
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.requireUserCredentials',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <Switch
                        size="xs"
                        label="Keep client session alive"
                        description={
                            <p>
                                This is intended to keep Snowflake sessions
                                alive beyond the typical 4 hour timeout limit.
                                You can see more details in{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                    rel="noreferrer"
                                >
                                    dbt documentation
                                </Anchor>
                                .
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.clientSessionKeepAlive',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <TextInput
                        size="xs"
                        label="Query tag"
                        description={
                            <p>
                                This is Snowflake query tags parameter. You can
                                see more details in{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                    rel="noreferrer"
                                >
                                    dbt documentation
                                </Anchor>
                                .
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.queryTag')}
                    />

                    <TextInput
                        size="xs"
                        label="Snowflake URL override"
                        description={
                            <p>
                                Usually Lightdash would connect to a default
                                url: account.snowflakecomputing.com. If you'd
                                like to override this (e.g. for the dbt server)
                                you can specify a full custom URL here.
                            </p>
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.accessUrl')}
                    />

                    <Select
                        size="xs"
                        clearable
                        placeholder="Auto"
                        label="Start of week"
                        description="Will be taken into account when using 'WEEK' time interval"
                        data={daysOfWeekOptions}
                        disabled={disabled}
                        {...form.getInputProps('credentials.startOfWeek')}
                        value={form.values.credentials?.startOfWeek?.toString()}
                        onChange={(value) =>
                            form.setFieldValue(
                                'credentials.startOfWeek',
                                value ? parseInt(value) : null,
                            )
                        }
                    />
                </Stack>
            </FormSection>

            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                Advanced configuration options
            </FormCollapseButton>
        </Stack>
    );
};
