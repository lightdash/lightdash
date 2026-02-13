select
    payment_id,
    amount as ua_case_1_none,
    amount as ua_case_2_any_only,
    amount as ua_case_3_required_only,
    amount as ua_case_4_required_and_any,
    amount as ua_case_5_required_pass_any_fail,
    amount as ua_case_6_any_pass_required_fail,
    amount as ua_case_7_required_multi_and_array,
    amount as ua_case_8_any_multi_and_array,
    amount as ua_case_9_both_multi_and_array
from {{ ref('payments') }}
