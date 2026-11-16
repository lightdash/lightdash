import { Button, Menu, Tooltip } from '@mantine/core';
import {
    IconChevronDown,
    IconPlayerPlay,
    IconTable,
} from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDevelopmentView } from '../../../../../features/semanticStudio/developmentView';
import { TryItModal } from './TryItModal';
import {
    useStudioPullRequest,
    type StudioPullRequest,
} from './useStudioPullRequest';

/** Primary where it is the next step, beside Merge; quiet on a chat card. */
type Look = 'primary' | 'quiet';

const buttonProps = (look: Look) =>
    look === 'primary'
        ? {
              size: 'xs',
              variant: 'filled',
              leftSection: <MantineIcon icon={IconPlayerPlay} size={12} />,
          }
        : { size: 'compact-xs', variant: 'default' };

const HINT =
    'Opens Explore over this page with your changes. Only you see them until they are merged.';

/** The way to try a pull request's changes in Explore, over the page: one model opens straight away, several ask which. */
export const TryItButton: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
    look: Look;
}> = ({ projectUuid, pullRequest, look }) => {
    const { changedModels, previewProjectUuid, prUrl } = pullRequest;
    const [isOn, setIsOn] = useDevelopmentView();
    const [trying, setTrying] = useState<string | null>(null);
    const wasOn = useRef(false);
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    // The app reads the changes while the modal is open, and goes back to how it was after.
    const open = (model: string) => {
        wasOn.current = isOn;
        setIsOn(true, previewProjectUuid);
        setTrying(model);
    };
    const close = () => {
        if (!wasOn.current) setIsOn(false);
        setTrying(null);
    };
    if (changedModels.length === 0) return null;
    return (
        <>
            {changedModels.length === 1 ? (
                <Tooltip multiline w={240} label={HINT}>
                    <Button
                        {...buttonProps(look)}
                        flex="none"
                        onClick={() => open(changedModels[0])}
                    >
                        Try it
                    </Button>
                </Tooltip>
            ) : (
                <Menu position="bottom-end">
                    <Menu.Target>
                        <Button
                            {...buttonProps(look)}
                            flex="none"
                            rightSection={
                                <MantineIcon icon={IconChevronDown} />
                            }
                        >
                            Try it
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>{HINT}</Menu.Label>
                        {changedModels.map((model) => (
                            <Menu.Item
                                key={model}
                                leftSection={<MantineIcon icon={IconTable} />}
                                onClick={() => open(model)}
                            >
                                {model}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            )}
            {trying ? (
                <TryItModal
                    projectUuid={projectUuid}
                    model={trying}
                    previewProjectUuid={previewProjectUuid}
                    title={`Trying ${trying}${number ? ` from #${number}` : ''}`}
                    onClose={close}
                />
            ) : null}
        </>
    );
};

/** Try it on a pull request card in the chat, for the pull request Studio is working on. */
export const PullRequestCardTryIt: FC<{
    projectUuid: string;
    prUrl: string;
}> = ({ projectUuid, prUrl }) => {
    const pullRequest = useStudioPullRequest(projectUuid);
    return pullRequest?.isOpen && pullRequest.prUrl === prUrl ? (
        <TryItButton
            projectUuid={projectUuid}
            pullRequest={pullRequest}
            look="quiet"
        />
    ) : null;
};
