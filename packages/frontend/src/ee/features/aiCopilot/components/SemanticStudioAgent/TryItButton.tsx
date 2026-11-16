import { Button, Menu, Tooltip } from '@mantine/core';
import {
    IconChevronDown,
    IconPlayerPlay,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useTriedFields } from '../../../../../features/semanticStudio/useModelFieldChanges';
import { useTryInExplore } from '../../../../../features/semanticStudio/useTryInExplore';
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
    'Opens Explore with your changes selected. Only you see them until they are merged.';

/** Opening a model in Explore on the person's changes, with what changed already selected. */
const useTryModel = (
    projectUuid: string,
    model: string,
    previewProjectUuid: string | null,
) => {
    const fields = useTriedFields(projectUuid, model, previewProjectUuid);
    const tryInExplore = useTryInExplore(projectUuid);
    return () => tryInExplore(model, previewProjectUuid, fields);
};

const TryModelButton: FC<{
    projectUuid: string;
    model: string;
    previewProjectUuid: string | null;
    look: Look;
}> = ({ projectUuid, model, previewProjectUuid, look }) => {
    const onTry = useTryModel(projectUuid, model, previewProjectUuid);
    return (
        <Tooltip multiline w={240} label={HINT}>
            <Button {...buttonProps(look)} flex="none" onClick={onTry}>
                Try it
            </Button>
        </Tooltip>
    );
};

const TryModelItem: FC<{
    projectUuid: string;
    model: string;
    previewProjectUuid: string | null;
}> = ({ projectUuid, model, previewProjectUuid }) => {
    const onTry = useTryModel(projectUuid, model, previewProjectUuid);
    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconTable} />}
            onClick={onTry}
        >
            {model}
        </Menu.Item>
    );
};

/** The way to try a pull request's changes: one model opens straight in Explore, several ask which. */
export const TryItButton: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
    look: Look;
}> = ({ projectUuid, pullRequest, look }) => {
    const { changedModels, previewProjectUuid } = pullRequest;
    if (changedModels.length === 0) return null;
    if (changedModels.length === 1) {
        return (
            <TryModelButton
                projectUuid={projectUuid}
                model={changedModels[0]}
                previewProjectUuid={previewProjectUuid}
                look={look}
            />
        );
    }
    return (
        <Menu position="bottom-end">
            <Menu.Target>
                <Button
                    {...buttonProps(look)}
                    flex="none"
                    rightSection={<MantineIcon icon={IconChevronDown} />}
                >
                    Try it
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{HINT}</Menu.Label>
                {changedModels.map((model) => (
                    <TryModelItem
                        key={model}
                        projectUuid={projectUuid}
                        model={model}
                        previewProjectUuid={previewProjectUuid}
                    />
                ))}
            </Menu.Dropdown>
        </Menu>
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
