import {
    LIVE_INTEGRATION_CATALOG,
    type ApiConnectorType,
} from '@lightdash/common';
import {
    CopyButton,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard } from './LiveSourceSettingsRows';
import classes from './LiveSourceSettingsRows.module.css';

const ScopeList: FC<{ scopes: readonly string[] }> = ({ scopes }) => (
    <Group gap={6} className={classes.setup}>
        {scopes.map((scope) => (
            <CopyButton key={scope} value={scope}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'} withinPortal>
                        <UnstyledButton
                            className={classes.scope}
                            onClick={copy}
                        >
                            {scope}
                            <MantineIcon
                                icon={copied ? IconCheck : IconCopy}
                                size={12}
                            />
                        </UnstyledButton>
                    </Tooltip>
                )}
            </CopyButton>
        ))}
    </Group>
);

/** The scopes a source's key needs, and optional ones, each one copyable. */
export const LiveSourceSetupCard: FC<{ connector: ApiConnectorType }> = ({
    connector,
}) => {
    const { scopes, optionalScopes } = LIVE_INTEGRATION_CATALOG[connector];
    if (!scopes || scopes.length === 0) return null;
    return (
        <SettingsCard title="Scopes" titleOutside>
            <Stack gap="xs">
                <ScopeList scopes={scopes} />
                {optionalScopes && (
                    <>
                        <Text fz="xs" c="dimmed">
                            Optional, for {optionalScopes.unlocks}
                        </Text>
                        <ScopeList scopes={optionalScopes.scopes} />
                    </>
                )}
            </Stack>
        </SettingsCard>
    );
};
