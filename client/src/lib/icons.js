// Icons are React components — they can't be JSON-serialized or stored in SQL.
// We persist an `iconName` string and resolve it to a component here on load.

import {
  Target, Plane, Home, PiggyBank, Wallet, CreditCard, Laptop, Car, GraduationCap,
  Heart, Gift, Utensils, Bus, ShoppingBag, Film, Stethoscope, ReceiptText,
  Flame, Trophy, Sparkles, ListChecks, TrendingUp, Coffee, Fuel, Zap,
} from "lucide-react";

// Goal / generic icon registry (used by the goal library + resolver).
export const ICONS = {
  Target, Plane, Home, PiggyBank, Wallet, CreditCard, Laptop, Car, GraduationCap,
  Heart, Gift, Flame, Trophy, Sparkles, ListChecks, TrendingUp, Coffee,
};

export const resolveIcon = (name) => ICONS[name] || Target;

// Category -> icon (categories come from the server as strings).
export const CATEGORY_ICONS = {
  Food: Utensils,
  Transport: Bus,
  Fuel: Fuel,
  Utilities: Zap,
  Shopping: ShoppingBag,
  Entertainment: Film,
  Health: Stethoscope,
  Education: GraduationCap,
  Bills: ReceiptText,
};
export const catIcon = (name) => CATEGORY_ICONS[name] || Wallet;

// Goal library offered in onboarding + goals page. iconName is what persists.
export const GOAL_LIBRARY = [
  { name: "Emergency fund", iconName: "PiggyBank" },
  { name: "Laptop", iconName: "Laptop" },
  { name: "Car", iconName: "Car" },
  { name: "Vacation", iconName: "Plane" },
  { name: "Wedding", iconName: "Heart" },
  { name: "House", iconName: "Home" },
  { name: "Education", iconName: "GraduationCap" },
];

// Challenge copy (client-side; server stores only the key + streak).
export const CHALLENGE_COPY = {
  no_spend_week: { name: "No-spend week", desc: "Go 7 days without a non-essential purchase.", iconName: "Flame" },
  cook_at_home: { name: "Cook at home 5 days", desc: "Skip delivery five days this week.", iconName: "Trophy" },
  cancel_subscription: { name: "Cancel one subscription", desc: "Drop a service you don't use.", iconName: "ListChecks" },
  round_up_savings: { name: "Round-up savings", desc: "Round each purchase up and save the difference.", iconName: "PiggyBank" },
  track_daily: { name: "Log every expense for a week", desc: "Build the tracking habit.", iconName: "Sparkles" },
};
