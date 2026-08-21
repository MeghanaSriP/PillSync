/*
  Multi-patient caregiver access
  - Patients can read linked caregiver profiles
  - Linked parties can update care-related profile fields on each other
  - Accepted caregivers can manage patient medications/schedules/refills
*/

-- Patient can read caregiver profile when linked (accepted)
DROP POLICY IF EXISTS "patient_read_caregiver_profile" ON profiles;
CREATE POLICY "patient_read_caregiver_profile"
ON profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.patient_id = auth.uid()
      AND caregiver_relations.caregiver_id = profiles.id
      AND caregiver_relations.status = 'accepted'
  )
);

-- Linked users can update care contact fields on each other's profiles
DROP POLICY IF EXISTS "linked_update_care_profile" ON profiles;
CREATE POLICY "linked_update_care_profile"
ON profiles FOR UPDATE TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.status = 'accepted'
      AND (
        (caregiver_relations.caregiver_id = auth.uid() AND caregiver_relations.patient_id = profiles.id)
        OR (caregiver_relations.patient_id = auth.uid() AND caregiver_relations.caregiver_id = profiles.id)
      )
  )
)
WITH CHECK (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.status = 'accepted'
      AND (
        (caregiver_relations.caregiver_id = auth.uid() AND caregiver_relations.patient_id = profiles.id)
        OR (caregiver_relations.patient_id = auth.uid() AND caregiver_relations.caregiver_id = profiles.id)
      )
  )
);

-- Caregivers can insert medications for accepted patients
DROP POLICY IF EXISTS "caregiver_insert_patient_medications" ON medications;
CREATE POLICY "caregiver_insert_patient_medications"
ON medications FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = medications.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "caregiver_update_patient_medications" ON medications;
CREATE POLICY "caregiver_update_patient_medications"
ON medications FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = medications.user_id
      AND caregiver_relations.status = 'accepted'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = medications.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "caregiver_delete_patient_medications" ON medications;
CREATE POLICY "caregiver_delete_patient_medications"
ON medications FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = medications.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

-- Schedules: caregivers manage for accepted patients
DROP POLICY IF EXISTS "caregiver_insert_patient_schedules" ON schedules;
CREATE POLICY "caregiver_insert_patient_schedules"
ON schedules FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = schedules.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "caregiver_update_patient_schedules" ON schedules;
CREATE POLICY "caregiver_update_patient_schedules"
ON schedules FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = schedules.user_id
      AND caregiver_relations.status = 'accepted'
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = schedules.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "caregiver_delete_patient_schedules" ON schedules;
CREATE POLICY "caregiver_delete_patient_schedules"
ON schedules FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = schedules.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

-- Prescriptions: caregivers can add for patients
DROP POLICY IF EXISTS "caregiver_insert_patient_prescriptions" ON prescriptions;
CREATE POLICY "caregiver_insert_patient_prescriptions"
ON prescriptions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = prescriptions.user_id
      AND caregiver_relations.status = 'accepted'
  )
);
