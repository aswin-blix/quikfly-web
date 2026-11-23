// Sidebar entries. Each is shown only to roles with its permission (PERMISSIONS in @quikfly/shared).
import { Bell, ClipboardList, Handshake, Headphones, IdCard, LayoutDashboard, Map, Package, ScrollText, Settings, Siren, TicketPercent, Users, UsersRound, type LucideIcon } from "lucide-react";
import type { Permission } from "@quikfly/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/alerts", label: "Alerts", icon: Bell, permission: "alerts.view" },
  { href: "/bookings", label: "Bookings", icon: ClipboardList, permission: "bookings.view" },
  { href: "/parcels", label: "Parcels", icon: Package, permission: "parcels.manage" },
  { href: "/customers", label: "Customers", icon: Users, permission: "customers.view" },
  { href: "/sos", label: "SOS alerts", icon: Siren, permission: "sos.manage" },
  { href: "/licences", label: "Licence reviews", icon: IdCard, permission: "licences.review" },
  { href: "/vendors", label: "Partners", icon: Handshake, permission: "vendors.review" },
  { href: "/support", label: "Support", icon: Headphones, permission: "support.manage" },
  { href: "/catalog", label: "Catalog", icon: Map, permission: "catalog.edit" },
  { href: "/catalog/list?kind=offer", label: "Offers", icon: TicketPercent, permission: "offers.edit" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "dashboard.view" },
  { href: "/team", label: "Team", icon: UsersRound, permission: "team.manage" },
  { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view" },
];

/** Routes that exist so far; entries for later slices stay hidden until their page ships. */
export const LIVE_ROUTES = new Set(["/", "/alerts", "/bookings", "/parcels", "/customers", "/sos", "/licences", "/vendors", "/support", "/catalog", "/catalog/list?kind=offer", "/settings", "/team", "/audit"]);

/** `full` is the path plus query string, so /catalog/list?kind=offer can be told apart from other catalog lists. */
export function isActive(href: string, path: string, full = path) {
  if (href === "/") return path === "/";
  if (href.includes("?")) return full === href || full.startsWith(`${href}&`) || (href.endsWith("kind=offer") && full.includes("kind=offer"));
  if (href === "/catalog") return path.startsWith("/catalog") && !full.includes("kind=offer");
  return path === href || path.startsWith(`${href}/`);
}
