select
    assessment_id,
    episode_id,
    student_id,
    administered_on,
    instrument,
    assessment_point,
    sequence,
    score,
    max_score,
    clinical_cutoff
from {{ ref('raw_outcome_assessments') }}
