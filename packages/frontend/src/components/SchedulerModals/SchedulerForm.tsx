import { Button } from '@blueprintjs/core';
import React, { FC, useMemo } from 'react';
import { useSlackChannels } from '../../hooks/slack/useSlackChannels';
import { isValidCronExpression } from '../../utils/fieldValidators';
import { ArrayInput } from '../ReactHookForm/ArrayInput';
import AutoComplete from '../ReactHookForm/AutoComplete';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import { SlackIcon, TargetRow } from './SchedulerModals.styles';

const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, ...rest }) => {
    const slackChannelsQuery = useSlackChannels();
    const slackChannels = useMemo(
        () =>
            (slackChannelsQuery.data || []).map((channel) => ({
                value: channel.id,
                label: channel.name,
            })),
        [slackChannelsQuery.data],
    );
    return (
        <Form name="scheduler" {...rest}>
            <Input
                label="Name"
                name="name"
                placeholder="Scheduled delivery name"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                label="Cron expression"
                name="cron"
                placeholder="0 0 * * *"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidCronExpression:
                            isValidCronExpression('Cron expression'),
                    },
                }}
            />
            <ArrayInput
                label="Send to"
                name="targets"
                disabled={disabled}
                renderRow={(key, index, remove) => (
                    <TargetRow key={key}>
                        <SlackIcon />
                        <AutoComplete
                            name={`targets.${index}.channel`}
                            items={slackChannels}
                            disabled={disabled}
                            isLoading={slackChannelsQuery.isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                            suggestProps={{
                                inputProps: {
                                    placeholder: 'Search slack channel...',
                                },
                            }}
                        />
                        <Button
                            minimal={true}
                            icon={'cross'}
                            onClick={() => remove(index)}
                            disabled={disabled}
                        />
                    </TargetRow>
                )}
                renderAppendRowButton={(append) => (
                    <Button
                        minimal
                        onClick={() => append({ channel: '' })}
                        icon={'plus'}
                        text="Add new"
                        disabled={disabled}
                    />
                )}
            />
        </Form>
    );
};

export default SchedulerForm;
