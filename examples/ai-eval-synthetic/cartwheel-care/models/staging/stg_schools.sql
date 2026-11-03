select
    school_id,
    district_id,
    school_name,
    school_level,
    enrollment,
    is_title_i
from {{ ref('raw_schools') }}
