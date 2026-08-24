import { type LearnDemo as LearnDemoManifest } from '@lightdash/common';
import { useState, type FC } from 'react';
import styles from './LearnLesson.module.css';

type Props = {
    demo: LearnDemoManifest;
    assetBaseUrl: string;
};

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

/** Click-through demo: one screenshot per step, the hotspot advances it. */
export const LearnDemo: FC<Props> = ({ demo, assetBaseUrl }) => {
    const [step, setStep] = useState(0);
    const current = demo.steps[step];
    if (!current) return null;
    const last = step === demo.steps.length - 1;

    return (
        <div className={styles.demo}>
            <div
                className={styles.demoStage}
                style={{
                    aspectRatio: `${demo.viewport.width} / ${demo.viewport.height}`,
                }}
            >
                <img
                    src={`${assetBaseUrl}/assets/${current.image}`}
                    alt={`${demo.title}, step ${step + 1}`}
                />
                {current.hotspot && !last && (
                    <button
                        type="button"
                        className={styles.demoHotspot}
                        aria-label="Next step"
                        style={{
                            left: pct(current.hotspot.x),
                            top: pct(current.hotspot.y),
                            width: pct(current.hotspot.width),
                            height: pct(current.hotspot.height),
                        }}
                        onClick={() => setStep(step + 1)}
                    />
                )}
            </div>
            <div className={styles.demoCaption}>
                <span className={styles.demoStepCount}>
                    {step + 1}/{demo.steps.length}
                </span>
                {current.caption}
                {!current.hotspot && !last && (
                    <button
                        type="button"
                        className={styles.demoButton}
                        onClick={() => setStep(step + 1)}
                    >
                        Next
                    </button>
                )}
                {last && (
                    <button
                        type="button"
                        className={styles.demoButton}
                        onClick={() => setStep(0)}
                    >
                        Replay
                    </button>
                )}
            </div>
        </div>
    );
};
