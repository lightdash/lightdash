select b.id::integer as id, 'scale_10_large'::text as label,
       (614 + coalesce(r0.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 8) as b(id)
left join {{ ref('scale_04_hub', 'scale_04_hub_0000') }} as r0 on b.id = r0.id
