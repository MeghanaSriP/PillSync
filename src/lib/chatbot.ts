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

const translations: Record<Language, Record<string, string>> = {
  en: {
    greeting: "Hello! I'm PillSync AI, your medication assistant. I can help you track doses, check refills, review your schedule, and answer questions about your medications. How can I help?",
    noMeds: "You don't have any medications yet. Add one from the Medications page and I can help you track it!",
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
    sideEffects: 'Known side effects for {name}: {effects}. Please consult your doctor if you experience any of these.',
    noSideEffects: "I don't have side effect data for {name} in my database.",
    medNotFound: "I couldn't find a medication called \"{name}\" in your list.",
    howToTake: 'For {name}: {instructions}',
    noInstructions: 'There are no special instructions for {name}.',
    interactions: "I'm not able to check drug interactions yet. Please consult your doctor or pharmacist about interactions between your medications.",
    emergency: "If this is a medical emergency, please contact your local emergency services immediately. I'm an assistant, not a doctor.",
    notDoctor: "I'm an AI assistant, not a doctor. For medical advice, please consult your healthcare provider.",
    suggestions: 'You can ask me things like: "What\'s my schedule today?", "Do I need refills?", "Tell me about my medications", or "What are the side effects of [medicine]?"',
    unknown: "I'm not sure how to help with that. {suggestions}",
    doseTaken: 'You have taken {taken} of {total} scheduled doses today ({rate}%).',
    noDoseLogs: "You don't have any dose history yet. Start logging your doses to track your progress!",
    welcomeBack: 'Welcome back, {name}! How can I help with your medications today?',
    refillFor: '{name} will last approximately {days} more days. Refill by {date}.',
    refillCritical: 'URGENT: {name} is critically low! Only {stock} {form} left. Please refill as soon as possible.',
    caregiverInfo: 'You can manage caregivers from the Caregivers page. They can help monitor your medications and log doses for you.',
    capabilities: 'I can help you with:\n• Check your daily schedule\n• Refill reminders\n• Medication information and side effects\n• Adherence tracking\n• Dose history\n\nJust ask me a question!',
    languageChanged: "Language changed to {language}. I'll respond in {language} now.",
  },
  hi: {
    greeting: 'नमस्ते! मैं PillSync AI हूँ, आपकी दवा सहायक। मैं आपको खुराक ट्रैक करने, रिफिल जांचने, अपना शेड्यूल देखने और दवाओं के बारे में सवालों के जवाब देने में मदद कर सकता हूँ। मैं कैसे मदद कर सकता हूँ?',
    noMeds: 'आपके पास अभी तक कोई दवा नहीं है। दवाएं पेज से एक जोड़ें और मैं उसे ट्रैक करने में मदद करूंगा!',
    todaySchedule: 'आज का आपका शेड्यूल:',
    noDosesToday: 'आज आपके लिए कोई खुराक निर्धारित नहीं है।',
    refillAlerts: 'रिफिल अलर्ट:',
    noRefillAlerts: 'आपकी सभी दवाएं अच्छी स्टॉक में हैं। अभी कोई रिफिल जरूरी नहीं।',
    adherence: 'आपकी 30-दिन की अनुपालन दर {rate}% है। {context}',
    adherenceGood: 'ट्रैक पर रहने के लिए बहुत बढ़िया!',
    adherenceFair: 'आप ठीक कर रहे हैं, लेकिन सुधार की गुंजाइश है।',
    adherenceLow: 'आपकी अनुपालन कम है। समय पर खुराक लेने की कोशिश करें।',
    activeMeds: 'आपके पास {count} सक्रिय दवाएं हैं:',
    medInfo: '{name} ({dosage}) — {stock} {form} बची हैं। {instructions}',
    lowStock: 'चेतावनी: {name} खत्म हो रही है! केवल {stock} {form} बची हैं!',
    sideEffects: '{name} के ज्ञात दुष्प्रभाव: {effects}। कोई दुष्प्रभाव हो तो अपने डॉक्टर से संपर्क करें।',
    noSideEffects: 'मेरे पास {name} के लिए दुष्प्रभाव डेटा नहीं है।',
    medNotFound: 'मुझे आपकी सूची में "{name}" नामक दवा नहीं मिली।',
    howToTake: '{name} के लिए: {instructions}',
    noInstructions: '{name} के लिए कोई विशेष निर्देश नहीं हैं।',
    interactions: 'मैं अभी दवा परस्पर क्रियाएं जांच नहीं सकता। कृपया अपने डॉक्टर या फार्मासिस्ट से सलाह लें।',
    emergency: 'यदि यह एक चिकित्सा आपातकाल है, तो तुरंत आपातकालीन सेवाओं से संपर्क करें। मैं एक सहायक हूँ, डॉक्टर नहीं।',
    notDoctor: 'मैं एक AI सहायक हूँ, डॉक्टर नहीं। चिकित्सा सलाह के लिए अपने चिकित्सक से सलाह लें।',
    suggestions: 'आप मुझसे पूछ सकते हैं: "मेरा आज का शेड्यूल क्या है?", "क्या मुझे रिफिल चाहिए?", "मेरी दवाओं के बारे में बताएं", या "[दवा] के दुष्प्रभाव क्या हैं?"',
    unknown: 'मुझे नहीं पता कि इसमें कैसे मदद करूँ। {suggestions}',
    doseTaken: 'आपने आज {total} में से {taken} निर्धारित खुराक ली ({rate}%)।',
    noDoseLogs: 'आपके पास अभी तक कोई खुराक इतिहास नहीं है। अपनी प्रगति ट्रैक करने के लिए खुराक दर्ज करना शुरू करें!',
    welcomeBack: 'वापसी पर स्वागत है, {name}! आज आपकी दवाओं में कैसे मदद करूँ?',
    refillFor: '{name} लगभग {days} और दिन चलेगी। {date} तक रिफिल करें।',
    refillCritical: 'तत्काल: {name} गंभीर रूप से कम है! केवल {stock} {form} बची हैं। जल्द से जल्द रिफिल करें।',
    caregiverInfo: 'आप देखभालकर्ता पेज से देखभालकर्ताओं का प्रबंधन कर सकते हैं। वे आपकी दवाएं ट्रैक करने में मदद कर सकते हैं।',
    capabilities: 'मैं इनमें मदद कर सकता हूँ:\n• दैनिक शेड्यूल जांचें\n• रिफिल अनुस्मारक\n• दवा जानकारी और दुष्प्रभाव\n• अनुपालन ट्रैकिंग\n• खुराक इतिहास\n\nबस पूछें!',
    languageChanged: 'भाषा बदलकर {language} कर दी गई। मैं अब {language} में जवाब दूंगा।',
  },
  ta: {
    greeting: 'வணக்கம்! நான் PillSync AI, உங்கள் மருந்து உதவியாளர். நான் உங்கள் டோஸ்களைக் கண்காணிக்க, ரீஃபில் சரிபார்க்க, உங்கள் அட்டவணையைப் பார்க்க, மற்றும் மருந்துகள் பற்றிய கேள்விகளுக்கு பதிலளிக்க உதவுவேன். எப்படி உதவலாம்?',
    noMeds: 'உங்களிடம் இன்னும் எந்த மருந்தும் இல்லை. மருந்துகள் பக்கத்திலிருந்து ஒன்றைச் சேர்த்து, நான் அதைக் கண்காணிக்க உதவுவேன்!',
    todaySchedule: 'இன்றைய உங்கள் அட்டவணை:',
    noDosesToday: 'இன்று உங்களுக்கு எந்த டோஸும் திட்டமிடப்படவில்லை.',
    refillAlerts: 'ரீஃபில் எச்சரிக்கைகள்:',
    noRefillAlerts: 'உங்கள் எல்லா மருந்துகளும் நன்றாக ஸ்டாக் செய்யப்பட்டுள்ளன. இப்போது ரீஃபில் தேவையில்லை.',
    adherence: 'உங்கள் 30 நாள் இணக்க விகிதம் {rate}%. {context}',
    adherenceGood: 'சரியாகப் பின்பற்றுவதற்கு சிறப்பாக செய்கிறீர்கள்!',
    adherenceFair: 'நல்லபடி செய்கிறீர்கள், ஆனால் மேம்படுத்த இடமுள்ளது.',
    adherenceLow: 'உங்கள் இணக்கம் குறைவாக உள்ளது. டோஸ்களை சரியான நேரத்தில் எடுக்க முயற்சிக்கவும்.',
    activeMeds: 'உங்களிடம் {count} செயலில் உள்ள மருந்து(கள்) உள்ளன:',
    medInfo: '{name} ({dosage}) — {stock} {form} மீதம். {instructions}',
    lowStock: 'எச்சரிக்கை: {name} குறைந்து வருகிறது! வெறும் {stock} {form} மட்டுமே மீதம்!',
    sideEffects: '{name} இன் அறியப்பட்ட பக்க விளைவுகள்: {effects}. ஏதேனும் அனுபவித்தால் உங்கள் மருத்துவரை அணுகவும்.',
    noSideEffects: '{name} க்கான பக்க விளைவு தரவு என்னிடம் இல்லை.',
    medNotFound: 'உங்கள் பட்டியலில் "{name}" என்ற மருந்தை நான் கண்டுபிடிக்க முடியவில்லை.',
    howToTake: '{name} க்கு: {instructions}',
    noInstructions: '{name} க்கு சிறப்பு வழிமுறைகள் இல்லை.',
    interactions: 'நான் இன்னும் மருந்து தொடர்புகளை சரிபார்க்க முடியவில்லை. உங்கள் மருத்துவர் அல்லது மருந்தாளுநரை அணுகவும்.',
    emergency: 'இது ஒரு மருத்துவ அவசரநிலை என்றால், உடனடியாக அவசர சேவைகளைத் தொடர்பு கொள்ளவும். நான் ஒரு உதவியாளர், மருத்துவர் அல்ல.',
    notDoctor: 'நான் ஒரு AI உதவியாளர், மருத்துவர் அல்ல. மருத்துவ ஆலோசனைக்கு உங்கள் சுகாதார வழங்குநரை அணுகவும்.',
    suggestions: 'நீங்கள் என்னிடம் கேட்கலாம்: "இன்றைய எனது அட்டவணை என்ன?", "எனக்கு ரீஃபில் தேவையா?", "எனது மருந்துகள் பற்றி சொல்லுங்கள்", அல்லது "[மருந்து] இன் பக்க விளைவுகள் என்ன?"',
    unknown: 'அதில் எப்படி உதவுவது என்று எனக்கு உறுதியாகத் தெரியவில்லை. {suggestions}',
    doseTaken: 'இன்று திட்டமிடப்பட்ட {total} டோஸ்களில் {taken} எடுத்துள்ளீர்கள் ({rate}%).',
    noDoseLogs: 'உங்களிடம் இன்னும் டோஸ் வரலாறு இல்லை. உங்கள் முன்னேற்றத்தைக் கண்காணிக்க டோஸ்களைப் பதிவு செய்யத் தொடங்கவும்!',
    welcomeBack: 'மீண்டும் வரவேற்கிறோம், {name}! இன்று உங்கள் மருந்துகளில் எப்படி உதவலாம்?',
    refillFor: '{name} தோராயமாக {days} நாட்கள் கூடுதலாக நீடிக்கும். {date} க்குள் ரீஃபில் செய்யவும்.',
    refillCritical: 'அவசரம்: {name} கடுமையாக குறைந்துள்ளது! வெறும் {stock} {form} மட்டுமே மீதம். கூடிய விரைவில் ரீஃபில் செய்யவும்.',
    caregiverInfo: 'பராமரிப்பாளர்கள் பக்கத்திலிருந்து பராமரிப்பாளர்களை நிர்வகிக்கலாம். அவர்கள் உங்கள் மருந்துகளைக் கண்காணிக்க உதவலாம்.',
    capabilities: 'நான் இவற்றில் உதவ முடியும்:\n• தினசரி அட்டவணையைச் சரிபார்க்க\n• ரீஃபில் நினைவூட்டல்கள்\n• மருந்து தகவல் மற்றும் பக்க விளைவுகள்\n• இணக்கக் கண்காணிப்பு\n• டோஸ் வரலாறு\n\nகேட்கவும்!',
    languageChanged: 'மொழி {language} ஆக மாற்றப்பட்டது. இப்போது {language} இல் பதிலளிப்பேன்.',
  },
  te: {
    greeting: 'నమస్కారం! నేను PillSync AI, మీ మందుల సహాయకుడిని. మీ డోస్‌లను ట్రాక్ చేయడం, రీఫిల్ తనిఖీ, మీ షెడ్యూల్ చూడటం మరియు మందుల గురించి ప్రశ్నలకు సమాధానాలు ఇవ్వడంలో సహాయం చేయగలను. ఎలా సహాయం చేయనం?',
    noMeds: 'మీ వద్ద ఇంకా ఏ మందులు లేవు. మందులు పేజీ నుండి ఒకదాన్ని జోడించండి, నేను దాన్ని ట్రాక్ చేయడంలో సహాయం చేస్తాను!',
    todaySchedule: 'మీ నేటి షెడ్యూల్:',
    noDosesToday: 'ఈ రోజు మీకు ఏ డోస్‌లు షెడ్యూల్ చేయబడలేదు.',
    refillAlerts: 'రీఫిల్ హెచ్చరికలు:',
    noRefillAlerts: 'మీ అన్ని మందులు బాగా స్టాక్‌లో ఉన్నాయి. ప్రస్తుతం రీఫిల్ అవసరం లేదు.',
    adherence: 'మీ 30-రోజుల అనుపాలన రేటు {rate}%. {context}',
    adherenceGood: 'ట్రాక్‌లో ఉండటానికి చాలా బాగుంది!',
    adherenceFair: 'మీరు బాగానే చేస్తున్నారు, కానీ మెరుగుదలకు స్థలం ఉంది.',
    adherenceLow: 'మీ అనుపాలన తక్కువగా ఉంది. డోస్‌లను సరైన సమయంలో తీసుకోవడానికి ప్రయత్నించండి.',
    activeMeds: 'మీ వద్ద {count} క్రియాశీల మందు(లు) ఉన్నాయి:',
    medInfo: '{name} ({dosage}) — {stock} {form} మిగిలి ఉన్నాయి. {instructions}',
    lowStock: 'హెచ్చరిక: {name} తగ్గిపోతోంది! కేవలం {stock} {form} మాత్రమే మిగిలి ఉన్నాయి!',
    sideEffects: '{name} యొక్క తెలిసిన దుష్ప్రభావాలు: {effects}. ఏవైనా అనుభవిస్తే మీ వైద్యుడిని సంప్రదించండి.',
    noSideEffects: '{name} కోసం దుష్ప్రభావ డేటా నా వద్ద లేదు.',
    medNotFound: 'మీ జాబితాలో "{name}" అనే మందును నేను కనుగొనలేకపోయాను.',
    howToTake: '{name} కోసం: {instructions}',
    noInstructions: '{name} కోసం ప్రత్యేక సూచనలు లేవు.',
    interactions: 'నేను ఇంకా మందుల పరస్పర చర్యలను తనిఖీ చేయలేను. మీ వైద్యుడు లేదా ఫార్మసిస్ట్‌ను సంప్రదించండి.',
    emergency: 'ఇది వైద్య అత్యవసర పరిస్థితి అయితే, వెంటనే అత్యవసర సేవలను సంప్రదించండి. నేను సహాయకుడిని, వైద్యుడను కాను.',
    notDoctor: 'నేను AI సహాయకుడిని, వైద్యుడను కాను. వైద్య సలహా కోసం మీ ఆరోగ్య సంరక్షణ ప్రదాతను సంప్రదించండి.',
    suggestions: 'మీరు నన్ను అడగవచ్చు: "నా నేటి షెడ్యూల్ ఏమిటి?", "నాకు రీఫిల్ అవసరా?", "నా మందుల గురించి చెప్పండి", లేదా "[మందు] యొక్క దుష్ప్రభావాలు ఏమిటి?"',
    unknown: 'దానిలో ఎలా సహాయం చేయాలో నాకు ఖచ్చితంగా తెలియదు. {suggestions}',
    doseTaken: 'ఈ రోజు షెడ్యూల్ చేసిన {total} డోస్‌లలో {taken} తీసుకున్నారు ({rate}%).',
    noDoseLogs: 'మీ వద్ద ఇంకా డోస్ చరిత్ర లేదు. మీ పురోగతిని ట్రాక్ చేయడానికి డోస్‌లను నమోదు చేయడం ప్రారంభించండి!',
    welcomeBack: 'తిరిగి స్వాగతం, {name}! ఈ రోజు మీ మందులలో ఎలా సహాయం చేయనం?',
    refillFor: '{name} దాదాపు {days} రోజులు మరింత నిలుస్తుంది. {date} లోపు రీఫిల్ చేయండి.',
    refillCritical: 'అత్యవసరం: {name} తీవ్రంగా తక్కువగా ఉంది! కేవలం {stock} {form} మాత్రమే మిగిలి ఉన్నాయి. త్వరగా రీఫిల్ చేయండి.',
    caregiverInfo: 'సంరక్షకులు పేజీ నుండి సంరక్షకులను నిర్వహించవచ్చు. వారు మీ మందులను ట్రాక్ చేయడంలో సహాయం చేయగలరు.',
    capabilities: 'నేను ఈ కింది వాటిలో సహాయం చేయగలను:\n• రోజువారీ షెడ్యూల్ తనిఖీ\n• రీఫిల్ రిమైండర్‌లు\n• మందుల సమాచారం మరియు దుష్ప్రభావాలు\n• అనుపాలన ట్రాకింగ్\n• డోస్ చరిత్ర\n\nఅడగండి!',
    languageChanged: 'భాష {language} కు మార్చబడింది. ఇప్పుడు {language} లో సమాధానం ఇస్తాను.',
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

export function generateResponse(userInput: string, ctx: ChatbotContext): string {
  const { medications, schedules, doseLogs, profile, medicineDb, language } = ctx;
  const input = lower(userInput);
  const lang = language;

  if (input.match(/^(hi|hello|hey|hola|namaste|ninhao|வணக்கம்|నమస్కారం|नमस्ते)/)) {
    return profile?.full_name
      ? t(lang, 'welcomeBack', { name: profile.full_name.split(' ')[0] })
      : t(lang, 'greeting');
  }

  if (input.includes('help') || input.includes('what can you do') || input.includes('உதவி') || input.includes('సహాయం') || input.includes('madad') || input.includes('मदद')) {
    return t(lang, 'capabilities');
  }

  if (input.includes('emergency') || input.includes('அவசரம்') || input.includes('అత్యవసరం') || input.includes('आपातकाल')) {
    return t(lang, 'emergency');
  }

  if (input.includes('interaction') || input.includes('பரஸ்பர') || input.includes('పరస్పర') || input.includes('परस्पर')) {
    return t(lang, 'interactions');
  }

  if (input.includes('caregiver') || input.includes('பராமரிப்பாளர்') || input.includes('సంరక్షకుడు') || input.includes('देखभाल')) {
    return t(lang, 'caregiverInfo');
  }

  if (input.includes('today') && (input.includes('schedule') || input.includes('dose') || input.includes('அட்டவணை') || input.includes('షెడ్యూల్') || input.includes('शेड्यूल'))) {
    if (medications.length === 0) return t(lang, 'noMeds');

    const today = new Date();
    const todayDow = today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    const todayDoses = schedules
      .filter((s) => s.frequency === 'daily' || (s.frequency === 'specific_days' && s.days_of_week?.includes(todayDow)))
      .flatMap((s) =>
        s.times.map((time) => {
          const log = doseLogs.find(
            (l) => l.medication_id === s.medication_id && l.scheduled_time.startsWith(todayStr) && l.scheduled_time.includes(time)
          );
          return { med: s.medication!, time, status: log?.status || 'pending' };
        })
      )
      .sort((a, b) => a.time.localeCompare(b.time));

    if (todayDoses.length === 0) return t(lang, 'noDosesToday');

    const lines = todayDoses.map((d) => {
      const statusIcon = d.status === 'taken' ? '✓' : d.status === 'skipped' ? '○' : d.status === 'missed' ? '✗' : '⏳';
      return `${statusIcon} ${d.med.name} — ${d.time}${d.med.dosage ? ` (${d.med.dosage})` : ''}`;
    });

    return `${t(lang, 'todaySchedule')}\n\n${lines.join('\n')}`;
  }

  if (input.includes('refill') || input.includes('ரீஃபில்') || input.includes('రీఫిల్') || input.includes('रिफिल')) {
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

  if (input.includes('adherence') || input.includes('இணக்கம்') || input.includes('అనుపాలన') || input.includes('अनुपालन')) {
    if (doseLogs.length === 0) return t(lang, 'noDoseLogs');
    const rate = getAdherenceRate(doseLogs, 30);
    const context = rate >= 80 ? t(lang, 'adherenceGood') : rate >= 50 ? t(lang, 'adherenceFair') : t(lang, 'adherenceLow');
    return t(lang, 'adherence', { rate, context });
  }

  if (input.includes('side effect') || input.includes('பக்க விளைவு') || input.includes('దుష్ప్రభావ') || input.includes('दुष्प्रभाव')) {
    const med = findMedication(userInput, medications);
    if (med && med.medicine_db) {
      const effects = med.medicine_db.side_effects;
      if (effects && effects.length > 0) {
        return t(lang, 'sideEffects', { name: med.name, effects: effects.join(', ') });
      }
    }
    const dbMed = findMedInDb(userInput, medicineDb);
    if (dbMed && dbMed.side_effects.length > 0) {
      return t(lang, 'sideEffects', { name: dbMed.name, effects: dbMed.side_effects.join(', ') });
    }
    return t(lang, 'noSideEffects', { name: med?.name || userInput });
  }

  if (input.includes('how') && (input.includes('take') || input.includes('எடு') || input.includes('తీసుకో') || input.includes('ले'))) {
    const med = findMedication(userInput, medications);
    if (med) {
      return med.instructions
        ? t(lang, 'howToTake', { name: med.name, instructions: med.instructions })
        : t(lang, 'noInstructions', { name: med.name });
    }
    return t(lang, 'medNotFound', { name: userInput });
  }

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

  if (input.includes('dose') || input.includes('taken') || input.includes('டோஸ்') || input.includes('డోస్') || input.includes('खुराक')) {
    if (doseLogs.length === 0) return t(lang, 'noDoseLogs');
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = doseLogs.filter((l) => l.scheduled_time.startsWith(today));
    const taken = todayLogs.filter((l) => l.status === 'taken').length;
    const total = todayLogs.length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
    return t(lang, 'doseTaken', { taken, total, rate });
  }

  return t(lang, 'unknown', { suggestions: t(lang, 'suggestions') });
}

export function generateGreeting(profile: Profile | null, lang: Language): string {
  return profile?.full_name
    ? t(lang, 'welcomeBack', { name: profile.full_name.split(' ')[0] })
    : t(lang, 'greeting');
}

export { t as translate };
