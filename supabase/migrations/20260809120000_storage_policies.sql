-- 1. Ensure the prescriptions storage bucket exists and is private
-- To prevent syntax errors in older/custom versions of Supabase storage schemas, 
-- we only insert the mandatory core columns: id, name, and public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Allow authenticated users to view buckets
DROP POLICY IF EXISTS "Allow authenticated select buckets" ON storage.buckets;
CREATE POLICY "Allow authenticated select buckets"
ON storage.buckets FOR SELECT
TO authenticated
USING (true);

-- 3. Enable RLS on storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Drop any potentially conflicting or default dashboard policies to clear the slate
DROP POLICY IF EXISTS "Allow authenticated upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated SELECT" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated INSERT" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated UPDATE" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated DELETE" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Give users INSERT access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Give users SELECT access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Give users DELETE access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Give users UPDATE access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Any authenticated user can upload" ON storage.objects;

-- 5. Create INSERT policy (verifies first folder matches user UUID, handles leading slashes robustly)
CREATE POLICY "Allow authenticated upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions' AND
  split_part(trim(leading '/' from name), '/', 1) = auth.uid()::text
);

-- 6. Create SELECT policy (verifies first folder matches user UUID, handles leading slashes robustly)
CREATE POLICY "Allow authenticated read own folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescriptions' AND
  split_part(trim(leading '/' from name), '/', 1) = auth.uid()::text
);

-- 7. Create DELETE policy (verifies first folder matches user UUID, handles leading slashes robustly)
CREATE POLICY "Allow authenticated delete own folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'prescriptions' AND
  split_part(trim(leading '/' from name), '/', 1) = auth.uid()::text
);
