import { type FC } from 'react';
import styles from './ArtifactMorphPicker.module.css';
import {
    ARTIFACT_MORPH_STYLES,
    useArtifactMorphStyle,
} from './artifactTransition';

/**
 * Dev-only floating picker for the artifact morph variant. Sits at the
 * bottom-left of the viewport. Remove the import from AiAgentPageLayout
 * before shipping (or guard with an env flag).
 */
export const ArtifactMorphPicker: FC = () => {
    const [current, setCurrent] = useArtifactMorphStyle();

    return (
        <div className={styles.picker} aria-label="Artifact morph style">
            <span className={styles.label}>morph</span>
            {ARTIFACT_MORPH_STYLES.map((style) => (
                <button
                    key={style}
                    type="button"
                    className={styles.button}
                    data-active={current === style}
                    onClick={() => setCurrent(style)}
                >
                    {style}
                </button>
            ))}
        </div>
    );
};
