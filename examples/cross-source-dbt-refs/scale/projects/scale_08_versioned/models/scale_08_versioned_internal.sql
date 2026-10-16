select b.id::integer as id, 'scale_08_versioned'::text as label,
       (204 + coalesce(r0.amount, 0) + coalesce(r1.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 17) as b(id)
left join {{ ref('scale_08_versioned_private') }} as r0 on b.id = r0.id
left join {{ ref('scale_08_versioned_protected') }} as r1 on b.id = r1.id
