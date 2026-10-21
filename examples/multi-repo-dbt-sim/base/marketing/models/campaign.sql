{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date
{% else %}
select c.id, c.label, (c.amount + m.amount)::numeric as amount, c.active, c.event_date
from {{ ref('marketing_base') }} c
join {{ ref('merchants', 'merchant') }} m on c.id = m.id
{% endif %}
