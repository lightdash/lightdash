select
    district_id,
    district_name,
    state,
    funding_model,
    partnership_start_date,
    enrollment,
    clinical_program_director
from {{ ref('raw_districts') }}
