import { type ApiConnectorType } from '@lightdash/common';
import {
    Anchor,
    Box,
    CopyButton,
    Group,
    List,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard } from './LiveSourceSettingsRows';
import classes from './LiveSourceSettingsRows.module.css';
import { LIVE_SOURCE_SETUP } from './liveSourceSetup';

/** What to do in the integration first, with its scopes ready to copy. */
export const LiveSourceSetupCard: FC<{ connector: ApiConnectorType }> = ({
    connector,
}) => {
    const { steps, scopes, link } = LIVE_SOURCE_SETUP[connector];
    return (
        <SettingsCard title="Before you start">
            <Box className={classes.setup}>
                {steps.length > 1 ? (
                    <List type="ordered" size="sm" spacing={4}>
                        {steps.map((step) => (
                            <List.Item key={step}>{step}</List.Item>
                        ))}
                    </List>
                ) : (
                    <span>{steps[0]}</span>
                )}
                {scopes && scopes.length > 0 ? (
                    <Group gap={6}>
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
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                                size={12}
                                            />
                                        </UnstyledButton>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        ))}
                    </Group>
                ) : null}
                {link ? (
                    <Anchor
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        fz="sm"
                    >
                        {link.label}
                    </Anchor>
                ) : null}
            </Box>
        </SettingsCard>
    );
};
