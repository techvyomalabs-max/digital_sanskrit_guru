import { createElement } from "react";
import {
  BookOpen,
  BookOpenText,
  Boxes,
  CalendarDays,
  Globe,
  GraduationCap,
  Headphones,
  Languages,
  Music,
  Package,
  Route,
  ScrollText,
  Sparkles,
  Tablet,
  Tag,
  Usb
} from "lucide-react";

// Lucide icon for a product category, picked from its name because categories
// are typed freely by admins. Used by the category menu and the search UI.
const CATEGORY_ICON_RULES = [
  [/kindle/i, Tablet],
  [/flipbook/i, BookOpenText],
  [/web/i, Globe],
  [/usb|pen ?drive/i, Usb],
  [/audio|device/i, Headphones],
  [/chant/i, Music],
  [/learning path|path/i, Route],
  [/course/i, GraduationCap],
  [/bulk/i, Boxes],
  [/festiv|festival|offer/i, Sparkles],
  [/calendar/i, CalendarDays],
  [/grammar/i, Languages],
  [/scripture|gita|veda|upanishad/i, ScrollText],
  [/bundle|combo|pack/i, Package],
  [/book|paperback/i, BookOpen]
];

export function getCategoryIcon(category) {
  const match = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(String(category || "")));
  return match ? match[1] : Tag;
}

// <CategoryIcon category="Web Version" size={14} /> renders that category's icon
export function CategoryIcon({ category, ...iconProps }) {
  return createElement(getCategoryIcon(category), iconProps);
}
