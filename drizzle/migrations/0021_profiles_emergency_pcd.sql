ALTER TABLE public.profiles
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text,
  ADD COLUMN is_pcd boolean not null default false,
  ADD COLUMN pcd_description text;