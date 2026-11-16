// Sidebar entries. Each is shown only to roles with its permission (PERMISSIONS in @quikfly/shared).
import { ClipboardList, IdCard, LayoutDashboard, Map, ScrollText, Settings, TicketPercent, type LucideIcon } from "lucide-react";
import type { Permission } from "@quikfly/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/bookings", label: "Bookings", icon: ClipboardList, permission: "bookings.view" },
  { href: "/licences", label: "Licence reviews", icon: IdCard, permission: "licences.review" },
  { href: "/catalog", label: "Catalog", icon: Map, permission: "catalog.edit" },
  { href: "/offers", label: "Offers", icon: TicketPercent, permission: "offers.edit" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "dashboard.view" },
  { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view" },
];

/** Routes that exist so far; entries for later slices stay hidden until their page ships. */
export const LIVE_ROUTES = new Set(["/", "/settings", "/audit"]);

export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
