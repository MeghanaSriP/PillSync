/*
# Seed medicines_db with common medicines

Provides the reference database that powers the "is this a valid medicine?" check
when a user adds a medication. Covers common categories: analgesics, antibiotics,
antihypertensives, antidiabetics, cardiovascular, psychiatric, respiratory,
gastrointestinal, vitamins/supplements, and thyroid/hormone therapies.

Uses ON CONFLICT (name) DO NOTHING so re-running is safe.
*/

INSERT INTO medicines_db (name, generic_name, category, form, common_dosages, side_effects, controlled, description)
VALUES
('Paracetamol','Acetaminophen','Analgesic','Tablet',ARRAY['500mg','650mg','1000mg'],ARRAY['Nausea','Liver damage (overdose)'],false,'Pain reliever and fever reducer'),
('Ibuprofen','Ibuprofen','NSAID','Tablet',ARRAY['200mg','400mg','600mg','800mg'],ARRAY['Stomach upset','Heartburn','Dizziness'],false,'Nonsteroidal anti-inflammatory drug for pain and inflammation'),
('Aspirin','Acetylsalicylic Acid','NSAID','Tablet',ARRAY['75mg','81mg','325mg','500mg'],ARRAY['Bleeding risk','Stomach irritation'],false,'Pain reliever, anti-inflammatory, and blood thinner'),
('Naproxen','Naproxen','NSAID','Tablet',ARRAY['250mg','500mg'],ARRAY['Stomach upset','Heartburn'],false,'NSAID for pain, inflammation, and menstrual cramps'),
('Amoxicillin','Amoxicillin','Antibiotic','Capsule',ARRAY['250mg','500mg','875mg'],ARRAY['Diarrhea','Rash','Nausea'],false,'Penicillin-class antibiotic for bacterial infections'),
('Azithromycin','Azithromycin','Antibiotic','Tablet',ARRAY['250mg','500mg'],ARRAY['Nausea','Diarrhea','Abdominal pain'],false,'Macrolide antibiotic for respiratory and skin infections'),
('Ciprofloxacin','Ciprofloxacin','Antibiotic','Tablet',ARRAY['250mg','500mg','750mg'],ARRAY['Nausea','Diarrhea','Headache'],false,'Fluoroquinolone antibiotic for urinary and respiratory infections'),
('Doxycycline','Doxycycline','Antibiotic','Capsule',ARRAY['100mg'],ARRAY['Sun sensitivity','Nausea','Esophageal irritation'],false,'Tetracycline antibiotic for acne and infections'),
('Metformin','Metformin','Antidiabetic','Tablet',ARRAY['500mg','850mg','1000mg'],ARRAY['Nausea','Diarrhea','Metallic taste'],false,'First-line medication for type 2 diabetes'),
('Glipizide','Glipizide','Antidiabetic','Tablet',ARRAY['5mg','10mg'],ARRAY['Hypoglycemia','Weight gain'],false,'Sulfonylurea to lower blood sugar'),
('Insulin Glargine','Insulin Glargine','Antidiabetic','Injection',ARRAY['100 IU/mL'],ARRAY['Hypoglycemia','Injection site reactions'],false,'Long-acting insulin for diabetes'),
('Sitagliptin','Sitagliptin','Antidiabetic','Tablet',ARRAY['25mg','50mg','100mg'],ARRAY['Upper respiratory infection','Headache'],false,'DPP-4 inhibitor for type 2 diabetes'),
('Atorvastatin','Atorvastatin','Cardiovascular','Tablet',ARRAY['10mg','20mg','40mg','80mg'],ARRAY['Muscle pain','Elevated liver enzymes'],false,'Statin to lower cholesterol'),
('Simvastatin','Simvastatin','Cardiovascular','Tablet',ARRAY['10mg','20mg','40mg'],ARRAY['Muscle pain','Headache'],false,'Statin to reduce LDL cholesterol'),
('Amlodipine','Amlodipine','Antihypertensive','Tablet',ARRAY['2.5mg','5mg','10mg'],ARRAY['Ankle swelling','Flushing','Dizziness'],false,'Calcium channel blocker for high blood pressure'),
('Lisinopril','Lisinopril','Antihypertensive','Tablet',ARRAY['5mg','10mg','20mg','40mg'],ARRAY['Dry cough','Dizziness'],false,'ACE inhibitor for hypertension and heart failure'),
('Losartan','Losartan','Antihypertensive','Tablet',ARRAY['25mg','50mg','100mg'],ARRAY['Dizziness','Back pain'],false,'Angiotensin receptor blocker for high blood pressure'),
('Metoprolol','Metoprolol','Antihypertensive','Tablet',ARRAY['25mg','50mg','100mg'],ARRAY['Fatigue','Bradycardia','Dizziness'],false,'Beta-blocker for hypertension and heart conditions'),
('Enalapril','Enalapril','Antihypertensive','Tablet',ARRAY['2.5mg','5mg','10mg','20mg'],ARRAY['Dry cough','Hyperkalemia'],false,'ACE inhibitor for high blood pressure'),
('Furosemide','Furosemide','Diuretic','Tablet',ARRAY['20mg','40mg','80mg'],ARRAY['Frequent urination','Dehydration','Low potassium'],false,'Loop diuretic for fluid retention and edema'),
('Hydrochlorothiazide','Hydrochlorothiazide','Diuretic','Tablet',ARRAY['12.5mg','25mg','50mg'],ARRAY['Frequent urination','Dizziness'],false,'Thiazide diuretic for hypertension'),
('Clopidogrel','Clopidogrel','Cardiovascular','Tablet',ARRAY['75mg'],ARRAY['Bleeding','Bruising'],false,'Antiplatelet to prevent blood clots'),
('Warfarin','Warfarin','Anticoagulant','Tablet',ARRAY['1mg','2mg','5mg'],ARRAY['Bleeding','Bruising'],false,'Blood thinner requiring INR monitoring'),
('Rivaroxaban','Rivaroxaban','Anticoagulant','Tablet',ARRAY['10mg','15mg','20mg'],ARRAY['Bleeding','Itching'],false,'Direct oral anticoagulant'),
('Omeprazole','Omeprazole','Gastrointestinal','Capsule',ARRAY['10mg','20mg','40mg'],ARRAY['Headache','Diarrhea'],false,'Proton pump inhibitor for acid reflux and ulcers'),
('Pantoprazole','Pantoprazole','Gastrointestinal','Tablet',ARRAY['20mg','40mg'],ARRAY['Headache','Diarrhea'],false,'PPI for GERD and stomach acid'),
('Ranitidine','Ranitidine','Gastrointestinal','Tablet',ARRAY['150mg','300mg'],ARRAY['Headache','Constipation'],false,'H2 blocker for acid reflux'),
('Loperamide','Loperamide','Gastrointestinal','Tablet',ARRAY['2mg'],ARRAY['Constipation','Dizziness'],false,'Anti-diarrheal medication'),
('Salbutamol','Albuterol','Respiratory','Inhaler',ARRAY['90 mcg/puff'],ARRAY['Tremor','Fast heartbeat','Headache'],false,'Bronchodilator for asthma and COPD'),
('Fluticasone','Fluticasone','Respiratory','Inhaler',ARRAY['50 mcg','110 mcg','220 mcg'],ARRAY['Sore throat','Hoarseness'],false,'Inhaled corticosteroid for asthma'),
('Montelukast','Montelukast','Respiratory','Tablet',ARRAY['4mg','5mg','10mg'],ARRAY['Headache','Stomach pain'],false,'Leukotriene receptor antagonist for allergies and asthma'),
('Sertraline','Sertraline','Psychiatric','Tablet',ARRAY['25mg','50mg','100mg'],ARRAY['Nausea','Insomnia','Dizziness'],false,'SSRI antidepressant'),
('Fluoxetine','Fluoxetine','Psychiatric','Capsule',ARRAY['10mg','20mg','40mg'],ARRAY['Insomnia','Nausea','Anxiety'],false,'SSRI for depression and anxiety'),
('Escitalopram','Escitalopram','Psychiatric','Tablet',ARRAY['5mg','10mg','20mg'],ARRAY['Nausea','Fatigue'],false,'SSRI for depression and generalized anxiety'),
('Diazepam','Diazepam','Psychiatric','Tablet',ARRAY['2mg','5mg','10mg'],ARRAY['Drowsiness','Dizziness','Dependency risk'],true,'Benzodiazepine for anxiety and muscle spasms'),
('Lorazepam','Lorazepam','Psychiatric','Tablet',ARRAY['0.5mg','1mg','2mg'],ARRAY['Drowsiness','Dizziness'],true,'Benzodiazepine for anxiety'),
('Levothyroxine','Levothyroxine','Thyroid','Tablet',ARRAY['25mcg','50mcg','75mcg','100mcg','125mcg'],ARRAY['Weight loss','Palpitations (if over-dosed)'],false,'Thyroid hormone replacement for hypothyroidism'),
('Methotrexate','Methotrexate','Immunosuppressant','Tablet',ARRAY['2.5mg'],ARRAY['Nausea','Liver toxicity','Low blood counts'],true,'Used for rheumatoid arthritis and certain cancers (low dose for autoimmune)'),
('Hydrocortisone','Hydrocortisone','Corticosteroid','Tablet',ARRAY['10mg','20mg'],ARRAY['Weight gain','Mood changes','Increased blood sugar'],false,'Corticosteroid for inflammation and adrenal insufficiency'),
('Prednisolone','Prednisolone','Corticosteroid','Tablet',ARRAY['5mg','10mg','20mg'],ARRAY['Increased appetite','Mood changes'],false,'Corticosteroid for inflammation and autoimmune conditions'),
('Vitamin D3','Cholecalciferol','Supplement','Capsule',ARRAY['1000 IU','2000 IU','5000 IU'],ARRAY['Usually well tolerated'],false,'Vitamin D supplement for bone health'),
('Vitamin B12','Cyanocobalamin','Supplement','Tablet',ARRAY['500mcg','1000mcg'],ARRAY['Usually well tolerated'],false,'B12 supplement for energy and nerve health'),
('Folic Acid','Folic Acid','Supplement','Tablet',ARRAY['400mcg','1mg','5mg'],ARRAY['Usually well tolerated'],false,'B-vitamin supplement, important in pregnancy'),
('Iron Supplement','Ferrous Sulfate','Supplement','Tablet',ARRAY['325mg'],ARRAY['Constipation','Stomach upset','Dark stools'],false,'Iron supplement for anemia'),
('Calcium Carbonate','Calcium Carbonate','Supplement','Tablet',ARRAY['500mg','600mg'],ARRAY['Constipation','Gas'],false,'Calcium supplement for bone health'),
('Cetirizine','Cetirizine','Antihistamine','Tablet',ARRAY['5mg','10mg'],ARRAY['Drowsiness','Dry mouth'],false,'Antihistamine for allergies'),
('Loratadine','Loratadine','Antihistamine','Tablet',ARRAY['10mg'],ARRAY['Headache','Drowsiness (rare)'],false,'Non-drowsy antihistamine for allergies'),
('Tramadol','Tramadol','Analgesic','Tablet',ARRAY['50mg','100mg'],ARRAY['Drowsiness','Nausea','Constipation'],true,'Opioid-like pain reliever for moderate to severe pain'),
('Gabapentin','Gabapentin','Anticonvulsant','Capsule',ARRAY['100mg','300mg','400mg','600mg'],ARRAY['Dizziness','Drowsiness'],false,'For nerve pain and seizures'),
('Pregabalin','Pregabalin','Anticonvulsant','Capsule',ARRAY['75mg','150mg','300mg'],ARRAY['Dizziness','Weight gain'],true,'For nerve pain and fibromyalgia')
ON CONFLICT (name) DO NOTHING;
