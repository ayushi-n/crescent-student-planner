import { LayoutDashboard, CalendarClock, BookOpen, GraduationCap, Briefcase, ListChecks, Settings, LineChart } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/planner", label: "Planner", short: "Plan", icon: CalendarClock },
  { href: "/academics", label: "Academics", short: "Study", icon: BookOpen },
  { href: "/todos", label: "To-dos", short: "To-dos", icon: ListChecks },
  { href: "/placements", label: "Placements", short: "Jobs", icon: Briefcase },
  { href: "/review", label: "Weekly review", short: "Review", icon: LineChart },
  { href: "/courses", label: "Courses", short: "Courses", icon: GraduationCap, desktopOnly: true },
];

export const SETTINGS_ITEM = { href: "/settings", label: "Settings", short: "Settings", icon: Settings };
