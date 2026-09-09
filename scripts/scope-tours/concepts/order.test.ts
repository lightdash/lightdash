import assert from 'node:assert/strict';
import { CONCEPT_LESSONS } from '../../../packages/frontend/src/features/learn/conceptLessons.generated';
import { citationForScope } from '../order';
const citations = citationForScope();
for (const [scope, lesson] of Object.entries(CONCEPT_LESSONS)) {
    const source = new URL(lesson.sections[0].sourceUrl);
    assert.deepEqual(citations.get(scope), {
        page: source.pathname.slice(1),
        anchor: source.hash.slice(1),
    });
}
console.log('Concept curriculum citation tests passed');
