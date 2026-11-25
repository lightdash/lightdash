/**
 * Who can query a live data source, read as the rows of the dialog that
 * edits it: open or restricted, then one row per condition.
 */
import { Code } from '@mantine/core';
import { useState, type FC } from 'react';
import { LiveSourceAccessRuleModal } from './LiveSourceAccessRuleModal';
import {
    describeLiveSourceAccessRule,
    type LiveSourceConnection,
} from './liveSourceRows';
import {
    SettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';

/** The rule's two groups, named as the dialog names them. */
const GROUPS = [
    { key: 'required', label: 'Must match all' },
    { key: 'any', label: 'Must match any' },
] as const;

export const LiveSourceAccessCard: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const [isEditing, setIsEditing] = useState(false);
    const isRestricted =
        describeLiveSourceAccessRule(connection.accessRule) !== null;
    return (
        <>
            <SettingsCard
                title="Access"
                edit={{ isEditing: false, onEdit: () => setIsEditing(true) }}
            >
                <SettingsRow
                    label="Query access"
                    // Says which it is; the dialog's caption offers both
                    hint={
                        isRestricted
                            ? 'Limited by user attribute'
                            : 'Open to the whole project'
                    }
                >
                    <SettingsValue>
                        {isRestricted ? 'Restricted' : 'Everyone'}
                    </SettingsValue>
                </SettingsRow>
                {GROUPS.flatMap(({ key, label }) =>
                    Object.entries(connection.accessRule?.[key] ?? {}).map(
                        ([name, values]) => (
                            <SettingsRow
                                key={`${key}:${name}`}
                                label={name}
                                hint={label}
                            >
                                {values.map((value) => (
                                    <Code key={value} fz="xs">
                                        {value}
                                    </Code>
                                ))}
                            </SettingsRow>
                        ),
                    ),
                )}
            </SettingsCard>
            {isEditing ? (
                <LiveSourceAccessRuleModal
                    projectUuid={projectUuid}
                    connection={connection}
                    onClose={() => setIsEditing(false)}
                />
            ) : null}
        </>
    );
};
