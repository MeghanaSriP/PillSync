import { Medication, DoseLog, Schedule, Profile, MedicineDb } from './supabase';
import { predictRefill, getAdherenceRate } from './refill';

export type Language = 'en' | 'hi' | 'ta' | 'te';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  language?: Language;
};

export type ChatbotContext = {
  medications: Medication[];
  schedules: Schedule[];
  doseLogs: DoseLog[];
  profile: Profile | null;
  medicineDb: MedicineDb[];
  language: Language;
};

export const LANGUAGES: { code: Language; label: string; flag: string; nativeName: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'English' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳', nativeName: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳', nativeName: 'தமிழ்' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳', nativeName: 'తెలుగు' },
];

const DRUG_KNOWLEDGE_BASE: Record<string, { purpose: string; side_effects: string[]; usage: string }> = {
  paracetamol: {
    purpose: 'Analgesic and antipyretic used to reduce fever and relieve mild to moderate pain (headaches, body aches, toothaches).',
    side_effects: ['Nausea', 'Mild stomach upset', 'Rare allergic skin rash'],
    usage: 'Take with or after food. Do not exceed 4,000 mg per day to protect liver health.'
  },
  acetaminophen: {
    purpose: 'Pain reliever and fever reducer.',
    side_effects: ['Nausea', 'Skin rash', 'Liver stress if taken in high doses'],
    usage: 'Take with water. Avoid alcohol while taking this medication.'
  },
  amoxicillin: {
    purpose: 'Penicillin antibiotic used to treat bacterial infections of the respiratory tract, ear, throat, skin, and urinary tract.',
    side_effects: ['Diarrhea', 'Nausea', 'Vomiting', 'Skin rash'],
    usage: 'Take at evenly spaced intervals and finish the entire prescribed course even if you feel better.'
  },
  ibuprofen: {
    purpose: 'Non-steroidal anti-inflammatory drug (NSAID) for pain relief, reducing swelling, and lowering fever.',
    side_effects: ['Heartburn', 'Stomach irritation', 'Dizziness', 'Mild nausea'],
    usage: 'Always take with food or milk to prevent stomach irritation.'
  },
  aspirin: {
    purpose: 'Blood thinner and pain reliever used to prevent cardiovascular events (heart attack, stroke) and relieve mild pain/inflammation.',
    side_effects: ['Stomach bleeding risk', 'Heartburn', 'Easy bruising', 'Nausea'],
    usage: 'Take after meals with a full glass of water.'
  },
  metformin: {
    purpose: 'First-line medication for managing type 2 diabetes by lowering blood glucose levels and improving insulin sensitivity.',
    side_effects: ['Nausea', 'Abdominal bloating', 'Diarrhea', 'Metallic taste'],
    usage: 'Take with meals to minimize stomach upset.'
  },
  omeprazole: {
    purpose: 'Proton pump inhibitor (PPI) that reduces stomach acid to treat acid reflux (GERD), heartburn, and stomach ulcers.',
    side_effects: ['Headache', 'Abdominal pain', 'Gas', 'Diarrhea'],
    usage: 'Take in the morning 30-60 minutes before breakfast with water.'
  },
  cetirizine: {
    purpose: 'Antihistamine used to relieve allergy symptoms such as sneezing, runny nose, watery eyes, and itching.',
    side_effects: ['Drowsiness', 'Dry mouth', 'Fatigue', 'Mild headache'],
    usage: 'Best taken once daily, often at bedtime if drowsiness occurs.'
  },
  atorvastatin: {
    purpose: 'Statin medication that lowers LDL (bad) cholesterol and triglycerides to prevent heart disease and stroke.',
    side_effects: ['Muscle pain', 'Mild joint pain', 'Digestive discomfort'],
    usage: 'Take once daily in the evening or at bedtime.'
  },
  amlodipine: {
    purpose: 'Calcium channel blocker used to treat high blood pressure (hypertension) and chest pain (angina).',
    side_effects: ['Swelling in ankles/feet (edema)', 'Dizziness', 'Flushing', 'Headache'],
    usage: 'Take once daily with or without food at the same time each day.'
  },
  losartan: {
    purpose: 'Angiotensin II receptor blocker (ARB) used to lower high blood pressure and protect kidney function in diabetic patients.',
    side_effects: ['Dizziness', 'Lightheadedness', 'Nasal congestion'],
    usage: 'Take once daily as directed by doctor.'
  },
  pantoprazole: {
    purpose: 'Acid reducer used to treat erosive esophagitis, GERD, and stomach ulcers.',
    side_effects: ['Headache', 'Diarrhea', 'Nausea', 'Flatulence'],
    usage: 'Take 30 minutes before a meal.'
  },
  azithromycin: {
    purpose: 'Macrolide antibiotic used for chest infections, sinus infections, and skin infections.',
    side_effects: ['Nausea', 'Diarrhea', 'Abdominal cramps', 'Headache'],
    usage: 'Take once daily for the exact duration prescribed.'
  },
  ciprofloxacin: {
    purpose: 'Fluoroquinolone antibiotic used for complex bacterial infections (UTIs, joint infections).',
    side_effects: ['Nausea', 'Tendonitis risk', 'Dizziness', 'Photosensitivity'],
    usage: 'Drink plenty of fluids. Avoid taking with dairy products or antacids.'
  },
  multivitamin: {
    purpose: 'Dietary supplement providing essential vitamins and minerals to support general immune health and energy.',
    side_effects: ['Mild stomach upset', 'Unusual taste in mouth'],
    usage: 'Take once daily with breakfast.'
  }
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    identity: "I am PillSync AI! 🤖 Your personal medication & health assistant. I help you track schedules, remind you of doses, manage refills, check medicine purposes & side effects, and answer health questions.",
    greeting: "Hello! I'm PillSync AI, your medication assistant. How can I help you today?",
    noMeds: "You don't have any medications logged yet. You can add one from the Medications page or ask me any question!",
    todaySchedule: 'Your schedule for today:',
    noDosesToday: 'You have no doses scheduled for today.',
    refillAlerts: 'Refill alerts:',
    noRefillAlerts: 'All your medications are well stocked. No refills needed right now.',
    adherence: 'Your 30-day adherence rate is {rate}%. {context}',
    adherenceGood: 'Great job staying on track!',
    adherenceFair: "You're doing okay, but there's room for improvement.",
    adherenceLow: 'Your adherence is low. Try to take your doses on time.',
    activeMeds: 'You have {count} active medication(s):',
    medInfo: '{name} ({dosage}) — {stock} {form} left. {instructions}',
    lowStock: 'Warning: {name} is running low with only {stock} {form} left!',
    sideEffects: 'Known side effects for {name}: {effects}. Please consult your doctor if you experience severe symptoms.',
    noSideEffects: "I don't have detailed side effect data for {name} in my local database, but ensure you take it as prescribed.",
    medNotFound: "I couldn't find a medication called \"{name}\" in your list.",
    purposeInfo: 'Purpose of {name}: {purpose}\nRecommended Usage: {usage}',
    howToTake: 'For {name}: {instructions}',
    noInstructions: 'There are no special instructions recorded for {name}. Take with water as prescribed.',
    interactions: "Please consult your doctor or pharmacist about drug interactions between your specific medications.",
    emergency: "If this is a medical emergency, please call your local emergency services (e.g., 911 / 108 / 112) immediately!",
    notDoctor: "I'm an AI medication assistant. For professional medical advice, consult your healthcare provider.",
    suggestions: 'You can ask me: "What is your name?", "What is my schedule today?", "What is the purpose of Paracetamol?", or "What are the side effects of Amoxicillin?"',
    unknown: "I'm not sure how to answer that yet. {suggestions}",
    doseTaken: 'You have taken {taken} of {total} scheduled doses today ({rate}%).',
    noDoseLogs: "You don't have any dose history yet. Start logging your doses to track your progress!",
    welcomeBack: 'Welcome back, {name}! I am PillSync AI. How can I help with your medications today?',
    refillFor: '{name} will last approximately {days} more days. Refill by {date}.',
    refillCritical: 'URGENT: {name} is critically low! Only {stock} {form} left. Please refill as soon as possible.',
    caregiverInfo: 'You can manage caregivers from the Caregivers page. They can help monitor your medications and receive alerts.',
    capabilities: 'I can help you with:\n• Identifying tablet purpose & side effects\n• Checking your daily schedule\n• Refill reminders & stock alerts\n• Medication adherence tracking\n• Answering general health & medication questions',
    languageChanged: "Language changed to {language}. I'll respond in {language} now.",
  },
  hi: {
    identity: "मैं PillSync AI हूँ! 🤖 आपकी व्यक्तिगत दवा और स्वास्थ्य सहायक। मैं आपको शेड्यूल ट्रैक करने, रिफिल प्रबंधित करने, दवाओं के उद्देश्य और दुष्प्रभावों की जांच करने में मदद करता हूँ।",
    greeting: 'नमस्ते! मैं PillSync AI हूँ, आपकी दवा सहायक। मैं आपकी कैसे मदद कर सकता हूँ?',
    noMeds: 'आपके पास अभी तक कोई दवा दर्ज नहीं है। आप दवाएं पेज से एक जोड़ सकते हैं!',
    todaySchedule: 'आज का आपका शेड्यूल:',
    noDosesToday: 'आज आपके लिए कोई खुराक निर्धारित नहीं है।',
    refillAlerts: 'रिफिल अलर्ट:',
    noRefillAlerts: 'आपकी सभी दवाएं अच्छी स्टॉक में हैं।',
    adherence: 'आपकी 30-दिन की अनुपालन दर {rate}% है। {context}',
    adherenceGood: 'ट्रैक पर रहने के लिए बहुत बढ़िया!',
    adherenceFair: 'आप ठीक कर रहे हैं, लेकिन सुधार की गुंजाइश है।',
    adherenceLow: 'आपकी अनुपालन कम है। समय पर खुराक लेने की कोशिश करें।',
    activeMeds: 'आपके पास {count} सक्रिय दवाएं हैं:',
    medInfo: '{name} ({dosage}) — {stock} {form} बची हैं। {instructions}',
    lowStock: 'चेतावनी: {name} खत्म हो रही है! केवल {stock} {form} बची हैं!',
    sideEffects: '{name} के ज्ञात दुष्प्रभाव: {effects}। गंभीर लक्षण होने पर अपने डॉक्टर से संपर्क करें।',
    noSideEffects: 'मेरे पास {name} के लिए दुष्प्रभाव डेटा नहीं है।',
    medNotFound: 'मुझे आपकी सूची में "{name}" नामक दवा नहीं मिली।',
    purposeInfo: '{name} का उद्देश्य: {purpose}\nअनुशंसित उपयोग: {usage}',
    howToTake: '{name} के लिए: {instructions}',
    noInstructions: '{name} के लिए कोई विशेष निर्देश नहीं हैं।',
    interactions: 'कृपया अपने डॉक्टर या फार्मासिस्ट से सलाह लें।',
    emergency: 'यदि यह एक आपातकाल है, तो तुरंत आपातकालीन सेवाओं से संपर्क करें!',
    notDoctor: 'मैं एक AI सहायक हूँ, डॉक्टर नहीं।',
    suggestions: 'आप मुझसे पूछ सकते हैं: "आपका नाम क्या है?", "मेरा आज का शेड्यूल?", "[दवा] का उद्देश्य क्या है?"',
    unknown: 'मुझे नहीं पता कि इसमें कैसे मदद करूँ। {suggestions}',
    doseTaken: 'आपने आज {total} में से {taken} निर्धारित खुराक ली ({rate}%)।',
    noDoseLogs: 'आपके पास अभी तक कोई खुराक इतिहास नहीं है।',
    welcomeBack: 'वापसी पर स्वागत है, {name}! मैं PillSync AI हूँ। आज आपकी दवाओं में कैसे मदद करूँ?',
    refillFor: '{name} लगभग {days} और दिन चलेगी। {date} तक रिफिल करें।',
    refillCritical: 'तत्काल: {name} गंभीर रूप से कम है! केवल {stock} {form} बची हैं।',
    caregiverInfo: 'आप देखभालकर्ता पेज से देखभालकर्ताओं का प्रबंधन कर सकते हैं।',
    capabilities: 'मैं इनमें मदद कर सकता हूँ:\n• गोलियों के उद्देश्य और दुष्प्रभावों की पहचान\n• दैनिक शेड्यूल जांचना\n• रिफिल रिमाइंडर\n• अनुपालन ट्रैकिंग',
    languageChanged: 'भाषा बदलकर {language} कर दी गई।',
  },
  ta: {
    identity: "நான் PillSync AI! 🤖 உங்கள் தனிப்பட்ட மருந்து மற்றும் சுகாதார உதவியாளர். அட்டவணைகளைக் கண்காணிக்க, டோஸ்களை நினைவூட்ட, பக்க விளைவுகளைச் சரிபார்க்க நான் உதவுகிறேன்.",
    greeting: 'வணக்கம்! நான் PillSync AI, உங்கள் மருந்து உதவியாளர். இன்று எப்படி உதவலாம்?',
    noMeds: 'உங்களிடம் இன்னும் எந்த மருந்தும் இல்லை. மருந்துகள் பக்கத்திலிருந்து ஒன்றைச் சேர்க்கலாம்!',
    todaySchedule: 'இன்றைய உங்கள் அட்டவணை:',
    noDosesToday: 'இன்று உங்களுக்கு எந்த டோஸும் திட்டமிடப்படவில்லை.',
    refillAlerts: 'ரீஃபில் எச்சரிக்கைகள்:',
    noRefillAlerts: 'உங்கள் எல்லா மருந்துகளும் நன்றாக ஸ்டாக் செய்யப்பட்டுள்ளன.',
    adherence: 'உங்கள் 30 நாள் இணக்க விகிதம் {rate}%. {context}',
    adherenceGood: 'சரியாகப் பின்பற்றுவதற்கு சிறப்பாக செய்கிறீர்கள்!',
    adherenceFair: 'நல்லபடி செய்கிறீர்கள், ஆனால் மேம்படுத்த இடமுள்ளது.',
    adherenceLow: 'உங்கள் இணக்கம் குறைவாக உள்ளது.',
    activeMeds: 'உங்களிடம் {count} செயலில் உள்ள மருந்து(கள்) உள்ளன:',
    medInfo: '{name} ({dosage}) — {stock} {form} மீதம். {instructions}',
    lowStock: 'எச்சரிக்கை: {name} குறைந்து வருகிறது! வெறும் {stock} {form} மட்டுமே மீதம்!',
    sideEffects: '{name} இன் அறியப்பட்ட பக்க விளைவுகள்: {effects}.',
    noSideEffects: '{name} க்கான பக்க விளைவு தரவு இல்லை.',
    medNotFound: 'உங்கள் பட்டியலில் "{name}" என்ற மருந்தை நான் கண்டுபிடிக்க முடியவில்லை.',
    purposeInfo: '{name} இன் நோக்கம்: {purpose}\nபரிந்துரைக்கப்பட்ட பயன்பாடு: {usage}',
    howToTake: '{name} க்கு: {instructions}',
    noInstructions: '{name} க்கு சிறப்பு வழிமுறைகள் இல்லை.',
    interactions: 'உங்கள் மருத்துவர் அல்லது மருந்தாளுநரை அணுகவும்.',
    emergency: 'இது ஒரு மருத்துவ அவசரநிலை என்றால், உடனடியாக அவசர சேவைகளைத் தொடர்பு கொள்ளவும்!',
    notDoctor: 'நான் ஒரு AI உதவியாளர், மருத்துவர் அல்ல.',
    suggestions: 'நீங்கள் கேட்கலாம்: "உங்கள் பெயர் என்ன?", "இன்றைய எனது அட்டவணை என்ன?", "[மருந்து] இன் நோக்கம் என்ன?"',
    unknown: 'அதில் எப்படி உதவுவது என்று உறுதியாகத் தெரியவில்லை. {suggestions}',
    doseTaken: 'இன்று திட்டமிடப்பட்ட {total} டோஸ்களில் {taken} எடுத்துள்ளீர்கள் ({rate}%).',
    noDoseLogs: 'உங்களிடம் இன்னும் டோஸ் வரலாறு இல்லை.',
    welcomeBack: 'மீண்டும் வரவேற்கிறோம், {name}! நான் PillSync AI. இன்று உங்கள் மருந்துகளில் எப்படி உதவலாம்?',
    refillFor: '{name} தோராயமாக {days} நாட்கள் கூடுதலாக நீடிக்கும்.',
    refillCritical: 'அவசரம்: {name} கடுமையாக குறைந்துள்ளது!',
    caregiverInfo: 'பராமரிப்பாளர்கள் பக்கத்திலிருந்து பராமரிப்பாளர்களை நிர்வகிக்கலாம்.',
    capabilities: 'நான் இவற்றில் உதவ முடியும்:\n• மாத்திரையின் நோக்கம் & பக்க விளைவுகள்\n• தினசரி அட்டவணை\n• ரீஃபில் நினைவூட்டல்கள்',
    languageChanged: 'மொழி {language} ஆக மாற்றப்பட்டது.',
  },
  te: {
    identity: "నేను PillSync AI! 🤖 మీ వ్యక్తిగత మందులు మరియు ఆరోగ్య సహాయకుడిని. షెడ్యూల్‌లను ట్రాక్ చేయడానికి, డోస్‌లను గుర్తు చేయడానికి మరియు దుష్ప్రభావాలను తనిఖీ చేయడానికి నేను సహాయం చేస్తాను.",
    greeting: 'నమస్కారం! నేను PillSync AI, మీ మందుల సహాయకుడిని. ఈ రోజు ఎలా సహాయం చేయనం?',
    noMeds: 'మీ వద్ద ఇంకా ఏ మందులు నమోదు చేయబడలేదు.',
    todaySchedule: 'మీ నేటి షెడ్యూల్:',
    noDosesToday: 'ఈ రోజు మీకు ఏ డోస్‌లు షెడ్యూల్ చేయబడలేదు.',
    refillAlerts: 'రీఫిల్ హెచ్చరికలు:',
    noRefillAlerts: 'మీ అన్ని మందులు బాగా స్టాక్‌లో ఉన్నాయి.',
    adherence: 'మీ 30-రోజుల అనుపాలన రేటు {rate}%. {context}',
    adherenceGood: 'ట్రాక్‌లో ఉండటానికి చాలా బాగుంది!',
    adherenceFair: 'మీరు బాగానే చేస్తున్నారు, కానీ మెరుగుదలకు స్థలం ఉంది.',
    adherenceLow: 'మీ అనుపాలన తక్కువగా ఉంది.',
    activeMeds: 'మీ వద్ద {count} క్రియాశీల మందు(లు) ఉన్నాయి:',
    medInfo: '{name} ({dosage}) — {stock} {form} మిగిలి ఉన్నాయి. {instructions}',
    lowStock: 'హెచ్చరిక: {name} తగ్గిపోతోంది! కేవలం {stock} {form} మాత్రమే మిగిలి ఉన్నాయి!',
    sideEffects: '{name} యొక్క తెలిసిన దుష్ప్రభావాలు: {effects}.',
    noSideEffects: '{name} కోసం దుష్ప్రభావ డేటా లేదు.',
    medNotFound: 'మీ జాబితాలో "{name}" అనే మందును నేను కనుగొనలేకపోయాను.',
    purposeInfo: '{name} యొక్క ఉద్దేశ్యం: {purpose}\nసిఫార్సు చేసిన వినియోగం: {usage}',
    howToTake: '{name} కోసం: {instructions}',
    noInstructions: '{name} కోసం ప్రత్యేక సూచనలు లేవు.',
    interactions: 'మీ వైద్యుడు లేదా ఫార్మసిస్ట్‌ను సంప్రదించండి.',
    emergency: 'ఇది వైద్య అత్యవసర పరిస్థితి అయితే, వెంటనే అత్యవసర సేవలను సంప్రదించండి!',
    notDoctor: 'నేను AI సహాయకుడిని, వైద్యుడను కాను.',
    suggestions: 'మీరు నన్ను అడగవచ్చు: "మీ పేరేమిటి?", "నా నేటి షెడ్యూల్ ఏమిటి?", "[మందు] యొక్క ఉద్దేశ్యం ఏమిటి?"',
    unknown: 'దానిలో ఎలా సహాయం చేయాలో నాకు ఖచ్చితంగా తెలియదు. {suggestions}',
    doseTaken: 'ఈ రోజు షెడ్యూల్ చేసిన {total} డోస్‌లలో {taken} తీసుకున్నారు ({rate}%).',
    noDoseLogs: 'మీ వద్ద ఇంకా డోస్ చరిత్ర లేదు.',
    welcomeBack: 'తిరిగి స్వాగతం, {name}! నేను PillSync AI. ఈ రోజు మీ మందులలో ఎలా సహాయం చేయనం?',
    refillFor: '{name} దాదాపు {days} రోజులు మరింత నిలుస్తుంది.',
    refillCritical: 'అత్యవసరం: {name} తీవ్రంగా తక్కువగా ఉంది!',
    caregiverInfo: 'సంరక్షకులు పేజీ నుండి సంరక్షకులను నిర్వహించవచ్చు.',
    capabilities: 'నేను ఈ కింది వాటిలో సహాయం చేయగలను:\n• మాత్రల ఉద్దేశ్యం & దుష్ప్రభావాలు\n• రోజువారీ షెడ్యూల్\n• రీఫిల్ రిమైండర్‌లు',
    languageChanged: 'భాష {language} కు మార్చబడింది.',
  },
};

function t(lang: Language, key: string, vars: Record<string, string | number> = {}): string {
  let str = translations[lang]?.[key] || translations.en[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return str;
}

const lower = (s: string) => s.toLowerCase().trim();

function findMedication(query: string, meds: Medication[]): Medication | null {
  const q = lower(query);
  return meds.find((m) => lower(m.name).includes(q) || (m.generic_name && lower(m.generic_name).includes(q))) || null;
}

function findMedInDb(query: string, db: MedicineDb[]): MedicineDb | null {
  const q = lower(query);
  return db.find((m) => lower(m.name).includes(q) || (m.generic_name || '').includes(q)) || null;
}

function findDrugKnowledge(query: string) {
  const q = lower(query);
  for (const [key, info] of Object.entries(DRUG_KNOWLEDGE_BASE)) {
    if (q.includes(key)) return { name: key.charAt(0).toUpperCase() + key.slice(1), ...info };
  }
  return null;
}

export function generateResponse(userInput: string, ctx: ChatbotContext): string {
  const { medications, schedules, doseLogs, profile, medicineDb, language } = ctx;
  const input = lower(userInput);
  const lang = language;

  // 1. Identity & Bot Name questions
  if (
    input.includes('your name') ||
    input.includes('who are you') ||
    input.includes('what are you called') ||
    input.includes('who created you') ||
    input.includes('who made you') ||
    input.includes('what is your name') ||
    input.includes('உன் பெயர்') ||
    input.includes('నీ పేరు') ||
    input.includes('तुम्हारा नाम')
  ) {
    return t(lang, 'identity');
  }

  // 2. Logged-in User Profile questions
  if (
    input.includes('my name') ||
    input.includes('who am i') ||
    input.includes('my profile') ||
    input.includes('my email') ||
    input.includes('my account') ||
    input.includes('who is logged in') ||
    input.includes('logged in user')
  ) {
    if (!profile) {
      return "You are currently not logged in or profile data is loading.";
    }
    return `👤 **Logged-in Profile Details:**\n• **Name:** ${profile.full_name}\n• **Email:** ${profile.email || 'N/A'}\n• **Role:** ${profile.role.toUpperCase()}\n• **Timezone:** ${profile.timezone || 'UTC'}`;
  }

  // 3. Combined Query: Information about ALL medicines AND schedules in this login
  if (
    (input.includes('medicine') && input.includes('schedule')) ||
    (input.includes('drug') && input.includes('schedule')) ||
    input.includes('all the medicines and schedules') ||
    input.includes('schedules in that login') ||
    input.includes('login info') ||
    input.includes('login data')
  ) {
    const userName = profile?.full_name || 'User';
    let output = `📋 **PillSync Login Overview for ${userName}**\n\n`;

    // Medicines section
    output += `💊 **Active Medications (${medications.length}):**\n`;
    if (medications.length === 0) {
      output += `• No medications added yet.\n`;
    } else {
      medications.forEach((m, idx) => {
        output += `• **${idx + 1}. ${m.name}** (${m.dosage || 'Standard Dose'})\n`;
        output += `  - Form: ${m.form || 'Tablet'} | Stock: ${m.stock_quantity} remaining (Threshold: ${m.refill_threshold})\n`;
        if (m.prescribing_doctor) output += `  - Prescribed by: Dr. ${m.prescribing_doctor}\n`;
        if (m.condition) output += `  - Condition: ${m.condition}\n`;
        if (m.instructions) output += `  - Instructions: ${m.instructions}\n`;
      });
    }

    output += `\n⏰ **Configured Schedules (${schedules.length}):**\n`;
    if (schedules.length === 0) {
      output += `• No schedules set up yet.\n`;
    } else {
      schedules.forEach((s, idx) => {
        const medName = s.medication?.name || 'Medication';
        output += `• **${idx + 1}. ${medName}**\n`;
        output += `  - Times: ${s.times.join(', ')}\n`;
        output += `  - Frequency: ${s.frequency} | Dose Amount: ${s.dose_amount || '1'} | With Food: ${s.with_food ? 'Yes 🍽️' : 'No'}\n`;
      });
    }

    return output;
  }

  // 4. Greetings
  if (input.match(/^(hi|hello|hey|hola|namaste|ninhao|வணக்கம்|నమస్కారం|नमस्ते)/)) {
    return profile?.full_name
      ? t(lang, 'welcomeBack', { name: profile.full_name.split(' ')[0] })
      : t(lang, 'greeting');
  }

  // 5. Capabilities / Help
  if (input.includes('help') || input.includes('what can you do') || input.includes('உதவி') || input.includes('సహాయం') || input.includes('madad') || input.includes('मदद')) {
    return t(lang, 'capabilities');
  }

  // 6. Emergency
  if (input.includes('emergency') || input.includes('அவசரம்') || input.includes('అత్యవసరం') || input.includes('आपातकाल')) {
    return t(lang, 'emergency');
  }

  // 7. Schedule queries (e.g. "give me my schedule for today")
  if (
    input.includes('schedule') ||
    input.includes('today') ||
    input.includes('dose') ||
    input.includes('அட்டவணை') ||
    input.includes('షెడ్యూల్') ||
    input.includes('शेड्यूल')
  ) {
    const today = new Date();
    const todayDow = today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    let todayDoses: { medName: string; dosage?: string; time: string; status: string }[] = [];

    if (schedules.length > 0) {
      todayDoses = schedules
        .filter((s) => s.frequency === 'daily' || (s.frequency === 'specific_days' && s.days_of_week?.includes(todayDow)))
        .flatMap((s) =>
          s.times.map((time) => {
            const log = doseLogs.find(
              (l) => l.medication_id === s.medication_id && l.scheduled_time.startsWith(todayStr) && l.scheduled_time.includes(time)
            );
            return { medName: s.medication?.name || 'Medication', dosage: s.medication?.dosage || undefined, time, status: log?.status || 'pending' };
          })
        )
        .sort((a, b) => a.time.localeCompare(b.time));
    }

    if (todayDoses.length === 0 && medications.length > 0) {
      // Fallback schedule listing active medications
      todayDoses = medications.map((m, idx) => ({
        medName: m.name,
        dosage: m.dosage || undefined,
        time: idx % 2 === 0 ? '08:00 AM' : '08:00 PM',
        status: 'pending'
      }));
    }

    if (todayDoses.length === 0) {
      return t(lang, 'noDosesToday');
    }

    const lines = todayDoses.map((d) => {
      const statusIcon = d.status === 'taken' ? '✓ Taken' : d.status === 'skipped' ? '○ Skipped' : d.status === 'missed' ? '✗ Missed' : '⏳ Pending';
      return `• [${d.time}] ${d.medName}${d.dosage ? ` (${d.dosage})` : ''} — ${statusIcon}`;
    });

    return `${t(lang, 'todaySchedule')}\n\n${lines.join('\n')}`;
  }

  // 8. Tablet Purpose / Usage queries
  if (
    input.includes('purpose') ||
    input.includes('used for') ||
    input.includes('why take') ||
    input.includes('what is this tablet') ||
    input.includes('what does this pill do') ||
    input.includes('उपयोग') ||
    input.includes('நோக்கம்') ||
    input.includes('ఉద్దేశ్యం')
  ) {
    const kbMatch = findDrugKnowledge(userInput);
    if (kbMatch) {
      return t(lang, 'purposeInfo', { name: kbMatch.name, purpose: kbMatch.purpose, usage: kbMatch.usage });
    }

    const med = findMedication(userInput, medications);
    if (med && med.medicine_db) {
      return t(lang, 'purposeInfo', {
        name: med.name,
        purpose: med.medicine_db.description || 'Medication prescribed for therapeutic treatment.',
        usage: med.instructions || 'Take as instructed by your prescribing doctor.'
      });
    }

    const dbMed = findMedInDb(userInput, medicineDb);
    if (dbMed) {
      return t(lang, 'purposeInfo', {
        name: dbMed.name,
        purpose: dbMed.description || 'Medication for therapeutic relief.',
        usage: 'Take as prescribed by healthcare provider.'
      });
    }

    return `PillSync AI: Tablets and medications are prescribed to treat specific conditions, manage symptoms, or restore wellness. For specific drug details, tell me the name of the medicine (e.g. Paracetamol, Amoxicillin, Metformin)!`;
  }

  // 9. Side effects queries
  if (
    input.includes('side effect') ||
    input.includes('adverse effect') ||
    input.includes('பக்க விளைவு') ||
    input.includes('దుష్ప్రభావ') ||
    input.includes('दुष्प्रभाव')
  ) {
    const kbMatch = findDrugKnowledge(userInput);
    if (kbMatch) {
      return t(lang, 'sideEffects', { name: kbMatch.name, effects: kbMatch.side_effects.join(', ') });
    }

    const med = findMedication(userInput, medications);
    if (med && med.medicine_db?.side_effects?.length) {
      return t(lang, 'sideEffects', { name: med.name, effects: med.medicine_db.side_effects.join(', ') });
    }

    const dbMed = findMedInDb(userInput, medicineDb);
    if (dbMed?.side_effects?.length) {
      return t(lang, 'sideEffects', { name: dbMed.name, effects: dbMed.side_effects.join(', ') });
    }

    return t(lang, 'noSideEffects', { name: med?.name || userInput });
  }

  // 10. Refill & Stock queries
  if (input.includes('refill') || input.includes('stock') || input.includes('ரீஃபில்') || input.includes('రీఫిల్') || input.includes('रिफिल')) {
    if (medications.length === 0) return t(lang, 'noMeds');

    const alerts: string[] = [];
    medications.forEach((med) => {
      const pred = predictRefill(med, doseLogs);
      if (pred.isCritical) {
        alerts.push(t(lang, 'refillCritical', { name: med.name, stock: med.stock_quantity, form: med.form?.toLowerCase() || 'pills' }));
      } else if (pred.isLowStock) {
        if (pred.daysRemaining !== null) {
          alerts.push(t(lang, 'refillFor', { name: med.name, days: pred.daysRemaining, date: pred.refillDate || '' }));
        } else {
          alerts.push(t(lang, 'lowStock', { name: med.name, stock: med.stock_quantity, form: med.form?.toLowerCase() || 'pills' }));
        }
      }
    });

    if (alerts.length === 0) return t(lang, 'noRefillAlerts');
    return `${t(lang, 'refillAlerts')}\n\n${alerts.join('\n')}`;
  }

  // 11. Adherence queries
  if (input.includes('adherence') || input.includes('compliance') || input.includes('இணக்கம்') || input.includes('అనుపాలన') || input.includes('अनुपालन')) {
    const rate = doseLogs.length > 0 ? getAdherenceRate(doseLogs, 30) : 88;
    const context = rate >= 80 ? t(lang, 'adherenceGood') : rate >= 50 ? t(lang, 'adherenceFair') : t(lang, 'adherenceLow');
    return t(lang, 'adherence', { rate, context });
  }

  // 12. How to take medication
  if (input.includes('how') && (input.includes('take') || input.includes('use') || input.includes('எடு') || input.includes('తీసుకో') || input.includes('లే'))) {
    const med = findMedication(userInput, medications);
    if (med) {
      return med.instructions
        ? t(lang, 'howToTake', { name: med.name, instructions: med.instructions })
        : t(lang, 'noInstructions', { name: med.name });
    }
    return t(lang, 'medNotFound', { name: userInput });
  }

  // 13. Medication listing
  if (input.includes('medication') || input.includes('medicine') || input.includes('மருந்து') || input.includes('మందు') || input.includes('दवा') || input.includes('list')) {
    if (medications.length === 0) return t(lang, 'noMeds');
    const activeMeds = medications.filter((m) => m.active);
    const lines = activeMeds.map((m) =>
      t(lang, 'medInfo', {
        name: m.name,
        dosage: m.dosage || '',
        stock: m.stock_quantity,
        form: m.form?.toLowerCase() || 'pills',
        instructions: m.instructions || '',
      })
    );
    return `${t(lang, 'activeMeds', { count: activeMeds.length })}\n\n${lines.join('\n')}`;
  }

  // 14. Caregivers
  if (input.includes('caregiver') || input.includes('பராமரிப்பாளர்') || input.includes('సంరక్షకుడు') || input.includes('देखभाल')) {
    return t(lang, 'caregiverInfo');
  }

  // Fallback response with helpful options
  return t(lang, 'unknown', { suggestions: t(lang, 'suggestions') });
}

// Async AI Response using Gemini API backend fallback for complex/open questions
export async function generateResponseAsync(userInput: string, ctx: ChatbotContext): Promise<string> {
  // First check local rule matches
  const localResponse = generateResponse(userInput, ctx);
  if (!localResponse.includes("I'm not sure how to answer that yet")) {
    return localResponse;
  }

  // Call Gemini backend AI if local rule is unknown
  try {
    const response = await fetch('http://localhost:3001/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: userInput,
        userContext: {
          profile: ctx.profile,
          medications: ctx.medications,
          schedules: ctx.schedules,
          doseLogs: ctx.doseLogs,
        },
        language: ctx.language,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.message) return data.message;
    }
  } catch (err) {
    console.warn("Gemini chatbot API fetch error:", err);
  }

  // If backend is unreachable or fails, construct intelligent summary local response
  if (ctx.medications.length > 0 || ctx.schedules.length > 0) {
    return `PillSync AI 🤖: I have full details of your account!\n\n${generateResponse('all medicines and schedules', ctx)}`;
  }

  return localResponse;
}

export function generateGreeting(profile: Profile | null, lang: Language): string {
  return profile?.full_name ? t(lang, 'welcomeBack', { name: profile.full_name.split(' ')[0] }) : t(lang, 'greeting');
}

export { t as translate };
