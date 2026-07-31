import { IconArrowUp } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import { ComposerSubmitButton } from '../../../components/common/PromptComposer/ComposerSubmitButton';
import PromptComposer, {
    type PromptComposerHandle,
} from '../../../components/common/PromptComposer/PromptComposer';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';

type Props = {
    placeholder: string;
    /** True while a build is running: keep typing, block sending. */
    isBuilding: boolean;
    onSubmit: (request: VizBuildRequest) => void;
};

/**
 * Describe-a-visualization input for the chart config panel.
 *
 * Only the author's words are sent. The visualization is handed its rows and a
 * mapping from its own field names to the query's columns at render, so it is
 * built to fit whatever query it is dropped into — not just this one.
 */
const DataAppVizComposer: FC<Props> = ({
    placeholder,
    isBuilding,
    onSubmit,
}) => {
    const composerRef = useRef<PromptComposerHandle>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const handleSubmit = () => {
        const description = composerRef.current?.getText().trim() ?? '';
        if (!description || isBuilding) return;
        composerRef.current?.clear();
        onSubmit({ description });
    };

    return (
        <PromptComposer
            ref={composerRef}
            size="md"
            placeholder={placeholder}
            submitDisabled={isBuilding}
            onEmptyChange={setIsEmpty}
            onSubmit={handleSubmit}
            toolbarRight={
                <ComposerSubmitButton
                    icon={IconArrowUp}
                    label="Send"
                    size="sm"
                    disabled={isEmpty || isBuilding}
                    loading={isBuilding}
                    onClick={handleSubmit}
                />
            }
        />
    );
};

export default DataAppVizComposer;
