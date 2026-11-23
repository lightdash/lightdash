import { Badge, Text, Tooltip } from '@mantine/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { useContext, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { DraftMarksContext } from './draftMarks';
import { describeFieldChanges } from './modelCode';
import { pullRequestNumberOf } from './urls';
import classes from './WorkbenchView.module.css';

/** Where this person's latest change to a model stands: waiting in a pull request, or published on this visit. */
export const ModelMark: FC<{ model: string }> = ({ model }) => {
    const { inReview, published } = useContext(DraftMarksContext);
    const review = inReview.get(model);
    if (review) {
        return (
            <Tooltip
                multiline
                maw={320}
                label={`${describeFieldChanges(review.fields) || 'Changed'}. Not published until the pull request merges.`}
            >
                <Badge
                    flex="none"
                    color="blue"
                    component="a"
                    href={review.pullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    leftSection={
                        <MantineIcon icon={IconGitPullRequest} size={12} />
                    }
                    onClick={(event) => event.stopPropagation()}
                >
                    In review #{pullRequestNumberOf(review.pullRequestUrl)}
                </Badge>
            </Tooltip>
        );
    }
    const mark = published.get(model);
    return mark ? (
        <Tooltip
            multiline
            maw={320}
            label={`You published this. ${mark.kind === 'new' ? '' : describeFieldChanges(mark.fields)}`.trim()}
        >
            <Text className={classes.changeTag} data-change="new">
                {mark.kind === 'new' ? 'New' : 'Updated'}
            </Text>
        </Tooltip>
    ) : null;
};
