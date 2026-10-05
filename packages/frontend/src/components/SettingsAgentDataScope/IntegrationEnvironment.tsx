import { Text, TextInput } from '@mantine/core';
import { SqlPanel } from './SqlPanel';
export const IntegrationEnvironment = ({
    cloud,
    account,
    setAccount,
    envBlock,
}: {
    cloud: boolean;
    account: string;
    setAccount: (value: string) => void;
    envBlock: string;
}) =>
    cloud ? (
        <Text fz="sm">Send the client id and secret to Lightdash support.</Text>
    ) : (
        <>
            <TextInput
                label="Snowflake account"
                value={account}
                onChange={(event) => setAccount(event.currentTarget.value)}
            />
            {envBlock && <SqlPanel sql={envBlock} copyLabel="Copy" />}
        </>
    );
