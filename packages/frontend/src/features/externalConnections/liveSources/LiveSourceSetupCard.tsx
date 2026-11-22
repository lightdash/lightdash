import {
    LIVE_INTEGRATION_CATALOG,
    type ApiConnectorType,
} from '@lightdash/common';
import { CopyButton, Group, Tooltip, UnstyledButton } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard } from './LiveSourceSettingsRows';
import classes from './LiveSourceSettingsRows.module.css';

/** The scopes a source's key needs, each one copyable. */
export const LiveSourceSetupCard: FC<{ connector: ApiConnectorType }> = ({
    connector,
}) => {
    const { scopes } = LIVE_INTEGRATION_CATALOG[connector];
    if (!scopes || scopes.length === 0) return null;
    return (
        <SettingsCard title="Scopes">
            <Group gap={6} className={classes.setup}>
                {scopes.map((scope) => (
                    <CopyButton key={scope} value={scope}>
                        {({ copied, copy }) => (
                            <Tooltip
                                label={copied ? 'Copied' : 'Copy'}
                                withinPortal
                            >
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
        </SettingsCard>
    );
};
