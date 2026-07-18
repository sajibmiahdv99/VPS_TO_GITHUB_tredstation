// Lightweight i18n for AGENT TRED (en / bn). Expand dictionaries as needed.

export type Locale = "en" | "bn";

const dict = {
  en: {
    "nav.pricing": "Pricing",
    "nav.faq": "FAQ",
    "nav.affiliate": "Affiliate",
    "nav.signin": "Sign in",
    "nav.getStarted": "Get started",
    "app.dashboard": "Dashboard",
    "app.onboarding": "Setup guide",
    "app.leaderboard": "Leaderboard",
    "onboarding.title": "Welcome to AGENT TRED",
    "onboarding.subtitle": "Complete these steps to start auto-trading safely.",
    "onboarding.step1": "Secure your account",
    "onboarding.step2": "Connect an exchange",
    "onboarding.step3": "Configure risk",
    "onboarding.step4": "Add a signal source",
    "onboarding.step5": "Choose a plan",
    "onboarding.done": "You're ready to trade",
    "landing.hero": "Automate signal trading with risk you control",
    "landing.cta": "Start free trial",
  },
  bn: {
    "nav.pricing": "মূল্য",
    "nav.faq": "প্রশ্নোত্তর",
    "nav.affiliate": "অ্যাফিলিয়েট",
    "nav.signin": "সাইন ইন",
    "nav.getStarted": "শুরু করুন",
    "app.dashboard": "ড্যাশবোর্ড",
    "app.onboarding": "সেটআপ গাইড",
    "app.leaderboard": "লিডারবোর্ড",
    "onboarding.title": "AGENT TRED-এ স্বাগতম",
    "onboarding.subtitle": "নিরাপদে অটো-ট্রেডিং শুরু করতে ধাপগুলো সম্পন্ন করুন।",
    "onboarding.step1": "অ্যাকাউন্ট সুরক্ষিত করুন",
    "onboarding.step2": "এক্সচেঞ্জ সংযুক্ত করুন",
    "onboarding.step3": "ঝুঁকি কনফিগার করুন",
    "onboarding.step4": "সিগন্যাল সোর্স যোগ করুন",
    "onboarding.step5": "প্ল্যান বেছে নিন",
    "onboarding.done": "আপনি ট্রেড করতে প্রস্তুত",
    "landing.hero": "ঝুঁকি নিয়ন্ত্রণে রেখে সিগন্যাল ট্রেডিং অটোমেট করুন",
    "landing.cta": "ফ্রি ট্রায়াল শুরু করুন",
  },
} as const;

export type MsgKey = keyof (typeof dict)["en"];

export function t(key: MsgKey, locale: Locale = "en"): string {
  return dict[locale][key] ?? dict.en[key] ?? key;
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("agent_tred_locale");
  if (stored === "bn" || stored === "en") return stored;
  return navigator.language?.startsWith("bn") ? "bn" : "en";
}

export function setLocale(locale: Locale) {
  if (typeof window !== "undefined") localStorage.setItem("agent_tred_locale", locale);
}
