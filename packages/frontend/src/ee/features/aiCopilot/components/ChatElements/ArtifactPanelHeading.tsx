import { assertUnreachable, interpolateUiString } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    getDefaultZIndex,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import styles from './ArtifactPanelHeading.module.css';

/** `revision`: the turn edited the previous result; `version`: a real app version. */
export type ArtifactPanelMarker =
    | { kind: 'revision' }
    | { kind: 'version'; version: number };

/** `expandable`: two-line clamp, full text on hover and click to expand; `tooltip`: an info icon beside the title. */
export type ArtifactPanelDescriptionDisplay = 'expandable' | 'tooltip';

type Props = {
    title: string;
    description: string | null;
    marker: ArtifactPanelMarker | null;
    descriptionDisplay: ArtifactPanelDescriptionDisplay;
};

const ExpandableDescription: FC<{ description: string }> = ({
    description,
}) => {
    const descriptionRef = useRef<HTMLParagraphElement>(null);
    const { ref: sizeRef, width } = useElementSize<HTMLParagraphElement>();
    const ref = useMergedRef(descriptionRef, sizeRef);
    const [isClamped, setIsClamped] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Only measured while clamped, so collapsing stays possible once expanded.
    useEffect(() => {
        const element = descriptionRef.current;
        if (!element || expanded) return;
        setIsClamped(element.scrollHeight > element.clientHeight + 1);
    }, [width, description, expanded]);

    const isToggleable = expanded || isClamped;
    const toggle = () => setExpanded((open) => !open);
    const onKeyDown = (event: KeyboardEvent<HTMLParagraphElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
    };

    return (
        <Tooltip
            label={description}
            multiline
            maw={420}
            openDelay={400}
            disabled={!isClamped || expanded}
            events={{ hover: true, focus: true, touch: false }}
            zIndex={getDefaultZIndex('max')}
        >
            <Text
                ref={ref}
                fz="sm"
                c="dimmed"
                lineClamp={expanded ? undefined : 2}
                className={styles.description}
                data-toggleable={isToggleable}
                role={isToggleable ? 'button' : undefined}
                tabIndex={isToggleable ? 0 : undefined}
                aria-expanded={isToggleable ? expanded : undefined}
                onClick={isToggleable ? toggle : undefined}
                onKeyDown={isToggleable ? onKeyDown : undefined}
            >
                {description}
            </Text>
        </Tooltip>
    );
};

export const ArtifactPanelHeading: FC<Props> = ({
    title,
    description,
    marker,
    descriptionDisplay,
}) => {
    const getUiString = useUiStrings();
    const badge = (() => {
        if (marker === null) return null;
        switch (marker.kind) {
            case 'revision':
                return {
                    label: getUiString('aiAgent.artifactPanel.edited'),
                    tooltip: getUiString('aiAgent.artifactPanel.editedTooltip'),
                };
            case 'version':
                return {
                    label: `v${marker.version}`,
                    tooltip: interpolateUiString(
                        getUiString('aiAgent.artifactPanel.version'),
                        { version: marker.version.toString() },
                    ),
                };
            default:
                return assertUnreachable(marker, 'Unknown panel marker');
        }
    })();

    return (
        <Stack gap={2} flex={1} miw={0}>
            <Group gap="xs" wrap="nowrap" miw={0}>
                <TruncatedText fz="md" fw={600} lh="sm" maxWidth="100%">
                    {title}
                </TruncatedText>
                {badge && (
                    <Tooltip label={badge.tooltip}>
                        <Badge flex="0 0 auto">{badge.label}</Badge>
                    </Tooltip>
                )}
                {description && descriptionDisplay === 'tooltip' && (
                    <Tooltip
                        label={description}
                        multiline
                        maw={400}
                        zIndex={getDefaultZIndex('max')}
                    >
                        <ActionIcon
                            size="sm"
                            flex="0 0 auto"
                            aria-label={getUiString(
                                'aiAgent.artifactPanel.description',
                            )}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                size={14}
                                color="dimmed"
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            {description && descriptionDisplay === 'expandable' && (
                <ExpandableDescription
                    key={description}
                    description={description}
                />
            )}
        </Stack>
    );
};
