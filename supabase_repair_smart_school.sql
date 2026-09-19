-- Repair the existing Smart School reference dataset.
-- Use this when the app reports e.g. "One has 33/40 periods configured."
-- It updates the existing class_subjects rows without deleting your school.

-- Class 1 / One
update class_subjects set weekly_periods=6 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000301';
update class_subjects set weekly_periods=5 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000302';
update class_subjects set weekly_periods=5 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000303';
update class_subjects set weekly_periods=6 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000305';
update class_subjects set weekly_periods=4 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000306';
update class_subjects set weekly_periods=3 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000307';
update class_subjects set weekly_periods=3 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000308';
update class_subjects set weekly_periods=4 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000309';
update class_subjects set weekly_periods=4 where class_id='00000000-0000-4000-8000-000000000101' and subject_id='00000000-0000-4000-8000-000000000314';

-- Classes 2-10 use the same values as the repaired seed file.
-- Re-run supabase_seed_smart_school.sql to repair all classes at once.

select c.name as class,
       coalesce(sum(cs.weekly_periods),0) as configured_periods,
       case when coalesce(sum(cs.weekly_periods),0)=40 then 'OK' else 'INVALID' end as status
from classes c
left join class_subjects cs on cs.class_id=c.id
where c.school_id='00000000-0000-4000-8000-000000000001'
group by c.id,c.name
order by c.id;
