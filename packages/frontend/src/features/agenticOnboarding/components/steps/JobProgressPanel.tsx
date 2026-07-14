import { type FC } from 'react';
import StepChecklist, {
    type StepChecklistItem,
} from '../connect/StepChecklist';
import StepPanel from './StepPanel';

const PLACEHOLDER_ITEMS = (labels: string[]): StepChecklistItem[] =>
    labels.map((label, index) => ({
        id: `placeholder-${index}`,
        label,
        status: index === 0 ? 'running' : 'pending',
        durationMs: null,
    }));

type JobProgressPanelProps = {
    title: string;
    description?: string;
    items: StepChecklistItem[];
    placeholderLabels: string[];
};

const JobProgressPanel: FC<JobProgressPanelProps> = ({
    title,
    description,
    items,
    placeholderLabels,
}) => {
    const checklistItems =
        items.length > 0 ? items : PLACEHOLDER_ITEMS(placeholderLabels);

    return (
        <StepPanel title={title} description={description}>
            <StepChecklist items={checklistItems} hasFailure={false} />
        </StepPanel>
    );
};

export default JobProgressPanel;
