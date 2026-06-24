import { Box, Group, HoverCard } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import SlackSvg from '../../../../svgs/slack.svg?react';
import { SlackStates } from '../types';
import { SchedulerFormSlackError } from './SchedulerFormSlackError';

type Props = {
    value: string[];
    onChange: (val: string[]) => void;
};

/**
 * Slack destination row for scheduled deliveries — icon + channel picker.
 */
export const SchedulerFormSlackInput: FC<Props> = ({ value, onChange }) => {
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const slackState = useMemo(() => {
        if (isInitialLoading) return SlackStates.LOADING;
        if (!organizationHasSlack) return SlackStates.NO_SLACK;
        if (!slackInstallation.hasRequiredScopes)
            return SlackStates.MISSING_SCOPES;
        return SlackStates.SUCCESS;
    }, [isInitialLoading, organizationHasSlack, slackInstallation]);

    const isDisabled = slackState !== SlackStates.SUCCESS;

    return (
        <Group wrap="nowrap" align="flex-start">
            <Box pt="xxs">
                <SlackSvg
                    style={{
                        margin: '5px 2px',
                        width: '20px',
                        height: '20px',
                    }}
                />
            </Box>
            <HoverCard
                disabled={!isDisabled}
                width={300}
                position="bottom-start"
                shadow="md"
            >
                <HoverCard.Target>
                    <Box w="100%">
                        <SlackChannelSelect
                            multiple
                            size="sm"
                            placeholder="Search slack channels"
                            value={value}
                            disabled={isDisabled}
                            includeDms
                            includeGroups
                            onChange={onChange}
                        />
                    </Box>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <SchedulerFormSlackError slackState={slackState} />
                </HoverCard.Dropdown>
            </HoverCard>
        </Group>
    );
};
