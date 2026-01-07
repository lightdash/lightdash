import { Box, Group, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import { DefaultValue } from '../../../../components/common/TagInput/DefaultValue/DefaultValue';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import MsTeamsSvg from '../../../../svgs/msteams.svg?react';

type MicrosoftTeamsDestinationProps = {
    onChange: (val: string[]) => void;
    msTeamTargets: string[];
};

const withTooltip = (Component: FC<any>) => {
    return ({ value, onRemove, ...props }: any) => (
        <Tooltip label={value} withinPortal multiline w="500px">
            <Component value={value} onRemove={onRemove} {...props} />
        </Tooltip>
    );
};

const RenderValueWithTooltip = withTooltip(DefaultValue);

const validateMsTeamsWebhook = (webhook: string): boolean => {
    if (webhook.length === 0) return false;
    if (!webhook.startsWith('https://')) return false;
    if (/\s/.test(webhook)) return false;

    return true;
};

export const SchedulerFormMicrosoftTeamsInput: FC<
    MicrosoftTeamsDestinationProps
> = ({ onChange, msTeamTargets }) => {
    return (
        <Group wrap="nowrap" mb="sm">
            <MsTeamsSvg
                style={{
                    margin: '5px 2px',
                    width: '20px',
                    height: '20px',
                }}
            />
            <Box w="100%">
                <TagInput
                    sx={{
                        span: {
                            maxWidth: '280px',
                        },
                    }}
                    radius="md"
                    clearable
                    placeholder="Enter Microsoft Teams webhook URLs"
                    value={msTeamTargets}
                    allowDuplicates={false}
                    splitChars={[',', ' ']}
                    validationFunction={validateMsTeamsWebhook}
                    onChange={onChange}
                    valueComponent={RenderValueWithTooltip}
                />
            </Box>
        </Group>
    );
};
