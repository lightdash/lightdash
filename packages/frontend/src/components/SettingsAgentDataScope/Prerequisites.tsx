import { Checkbox, Stack, Text } from '@mantine/core';

export const Prerequisites = ({
    isSnowflake,
    enterpriseConfirmed,
    roleConfirmed,
    setEnterpriseConfirmed,
    setRoleConfirmed,
}: {
    isSnowflake: boolean;
    enterpriseConfirmed: boolean;
    roleConfirmed: boolean;
    setEnterpriseConfirmed: (value: boolean) => void;
    setRoleConfirmed: (value: boolean) => void;
}) =>
    isSnowflake ? (
        <Stack gap="xs">
            <Text fz="sm">Confirm these prerequisites in Snowflake:</Text>
            <Checkbox
                label="Snowflake Enterprise edition for masking policies"
                checked={enterpriseConfirmed}
                onChange={(event) =>
                    setEnterpriseConfirmed(event.currentTarget.checked)
                }
            />
            <Checkbox
                label="I have a role that can create integrations, policies and tags"
                checked={roleConfirmed}
                onChange={(event) =>
                    setRoleConfirmed(event.currentTarget.checked)
                }
            />
        </Stack>
    ) : (
        <Text>This project does not use Snowflake.</Text>
    );
