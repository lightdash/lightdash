import { Text, TextInput } from '@mantine/core';
import { SqlPanel } from './SqlPanel';
export const IntegrationEnvironment = ({
    cloud,
    account,
    envBlock,
}: {
    cloud: boolean;
    account: string;
    envBlock: string;
}) =>
    cloud ? (
        <Text fz="sm">
            Your deployment admin sets the OAuth client ID and secret in the
            deployment configuration. Do not send secrets to support.
        </Text>
    ) : (
        <>
            <TextInput label="Snowflake account" value={account} readOnly />
            {envBlock && (
                <SqlPanel
                    sql={envBlock}
                    language="bash"
                    summary="Your deployment admin sets these environment variables and restarts the server."
                />
            )}
        </>
    );
