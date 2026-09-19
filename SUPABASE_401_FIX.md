# Supabase browser write permissions

If the browser shows PostgreSQL `42501` while saving, the URL/key are reaching Supabase successfully. `42501` means the browser `anon` role is missing database permissions and/or an RLS policy allows the role to read but not write.

## Fix

1. Open Supabase Dashboard → SQL Editor for the same project used by `VITE_SUPABASE_URL`.
2. Open `supabase.sql` from this project and run the whole file.
3. In particular, make sure this block succeeds:

```sql
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;
```

The file also creates permissive MVP RLS policies for the `anon` role because this version intentionally has no Supabase Auth.

## Environment variables

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

After changing `.env.local`, stop and restart Vite (`Ctrl+C`, then `npm run dev`).

Do not use a service-role/secret key in the browser.
