select * from {{ ref('proj_owner_one', 'shared_model') }}
union all
select * from {{ ref('proj_owner_two', 'owned_other') }}
