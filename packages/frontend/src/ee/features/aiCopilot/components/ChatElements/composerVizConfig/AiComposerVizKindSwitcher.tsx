import { COMPOSER_VIZ_KINDS, type ComposerVizKind } from '@lightdash/common';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { getComposerVizKindIcon } from './composerVizKindIcon';
import { getComposerVizKindLabelT } from './composerVizKindLabel';

type Props = {
    value: ComposerVizKind;
    /** Kinds the displayed result can render; the rest show disabled. */
    availableKinds: ComposerVizKind[];
    onChange: (kind: ComposerVizKind) => void;
};

/** The viz switcher: one icon button per kind. */
export const AiComposerVizKindSwitcher: FC<Props> = ({
    value,
    availableKinds,
    onChange,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Group
            gap="xxs"
            wrap="nowrap"
            role="group"
            aria-label={t('vizKind.switcherLabel')}
        >
            {COMPOSER_VIZ_KINDS.map((kind) => {
                const label = getComposerVizKindLabelT(kind, t);
                const isAvailable = availableKinds.includes(kind);
                const isSelected = kind === value;
                return (
                    <Tooltip
                        key={kind}
                        label={
                            isAvailable
                                ? label
                                : t('vizKind.doesNotFit', { kind: label })
                        }
                        withinPortal
                    >
                        <ActionIcon
                            size="md"
                            color="gray"
                            variant={isSelected ? 'light' : 'subtle'}
                            aria-label={label}
                            aria-pressed={isSelected}
                            data-kind={kind}
                            disabled={!isAvailable}
                            onClick={() => onChange(kind)}
                        >
                            <MantineIcon
                                icon={getComposerVizKindIcon(kind)}
                                size={16}
                            />
                        </ActionIcon>
                    </Tooltip>
                );
            })}
        </Group>
    );
};
