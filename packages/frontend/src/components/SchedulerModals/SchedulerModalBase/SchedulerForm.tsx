import { Button } from '@blueprintjs/core';
import cronstrue from 'cronstrue';
import React, { FC, useMemo } from 'react';
import { useSlackChannels } from '../../../hooks/slack/useSlackChannels';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { ArrayInput } from '../../ReactHookForm/ArrayInput';
import AutoComplete from '../../ReactHookForm/AutoComplete';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import { SlackIcon, TargetRow } from './SchedulerModalBase.styles';

const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, methods, ...rest }) => {
    const slackChannelsQuery = useSlackChannels();
    const slackChannels = useMemo(
        () =>
            (slackChannelsQuery.data || []).map((channel) => ({
                value: channel.id,
                label: channel.name,
            })),
        [slackChannelsQuery.data],
    );
    const cronValue = methods.watch('cron', '0 9 * * 1');
    const cronHelperText = useMemo(() => {
        const validationError =
            isInvalidCronExpression('Cron expression')(cronValue);
        const cronHumanString = cronstrue.toString(cronValue, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        return validationError ?? cronHumanString;
    }, [cronValue]);
    return (
        <Form name="scheduler" methods={methods} {...rest}>
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
                label="Cron expression (UTC)"
                name="cron"
                placeholder="0 9 * * 1"
                defaultValue="0 9 * * 1"
                helperText={cronHelperText}
                disabled={disabled}
                rules={{
                    required: 'Required field',
                    validate: {
                        isValidCronExpression:
                            isInvalidCronExpression('Cron expression'),
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
