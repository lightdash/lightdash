import { Box, Button, Text } from '@mantine/core';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    GROUP_DESCRIPTIONS,
    GROUP_LABELS,
    GROUP_ORDER,
    type LearnModule,
} from './catalogue';
import { GROUP_ICONS, groupVars } from './groupVisuals';
import styles from './Learn.module.css';

type Props = {
    /** Whether the viewer may enable Learn (an organization admin). */
    canEnable: boolean;
    enabling: boolean;
    error: string | null;
    onEnable: () => void;
    /** The library that enabling unlocks, for the summary. */
    catalogue: LearnModule[];
};

/**
 * What the Learn page shows before the organization has a training
 * project (CS-257): what enabling unlocks, a button for admins and a
 * pointer to an admin for everyone else.
 */
export const EnableLearnPanel: FC<Props> = ({
    canEnable,
    enabling,
    error,
    onEnable,
    catalogue,
}) => {
    const groups = GROUP_ORDER.filter((group) =>
        catalogue.some((module) => module.group === group),
    );

    return (
        <Box className={styles.enableShell} data-learn-enable-panel>
            <Box className={styles.enableColumn}>
                <Box>
                    <span
                        className={`${styles.overline} ${styles.overlineAccent}`}
                    >
                        Learn
                    </span>
                    <h1 className={styles.enableTitle}>
                        Learn Lightdash by doing, on data nobody can break
                    </h1>
                    <p className={styles.enableLede}>
                        Learn gives everyone in your organisation a sample
                        project to practise on, with a guided walkthrough for
                        each thing Lightdash can do. Every walkthrough runs in a
                        fresh copy of that project and the copy is removed when
                        it ends, so nothing here touches your real projects.
                    </p>
                </Box>

                <Box className={styles.enableGrid}>
                    <Box className={styles.enableGroups}>
                        {groups.map((group) => {
                            const Glyph = GROUP_ICONS[group];
                            return (
                                <Box
                                    key={group}
                                    className={styles.enableGroup}
                                    style={groupVars(group)}
                                >
                                    <span className={styles.enableGroupIcon}>
                                        <MantineIcon icon={Glyph} size={18} />
                                    </span>
                                    <Box>
                                        <h3>{GROUP_LABELS[group]}</h3>
                                        <p>{GROUP_DESCRIPTIONS[group]}</p>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>

                    <Box component="aside" className={styles.enableCard}>
                        <span className={styles.overline}>Not enabled yet</span>
                        {canEnable ? (
                            <>
                                <h2>Enable Learn for your organisation</h2>
                                <p>Enabling does three things:</p>
                                <ul>
                                    <li>
                                        creates a project named Training (sample
                                        data), on a small built-in dataset;
                                    </li>
                                    <li>
                                        gives everyone the permissions to
                                        practise there, and only there;
                                    </li>
                                    <li>makes you that project's admin.</li>
                                </ul>
                                <Button
                                    color="indigo"
                                    size="md"
                                    mt={6}
                                    loading={enabling}
                                    onClick={onEnable}
                                    data-learn-enable
                                >
                                    Enable Learn
                                </Button>
                            </>
                        ) : (
                            <>
                                <h2>Ask an admin to enable Learn</h2>
                                <p data-learn-ask-admin>
                                    An organisation admin turns Learn on from
                                    this page. Once they have, every walkthrough
                                    here is yours to start.
                                </p>
                            </>
                        )}
                        {error && (
                            <Text c="red" fz="sm" data-learn-enable-error>
                                {error}
                            </Text>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
