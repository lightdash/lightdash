select
    source,
    target,
    {{ cast_integer('weight') }} as weight
from {{ ref('raw_sankey_demo') }}
