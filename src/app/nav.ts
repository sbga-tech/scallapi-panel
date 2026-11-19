import {
  ChartNoAxesColumn,
  Cpu,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Network,
  Puzzle,
  Scale,
  Server,
  Settings,
  Waypoints,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  key: string
  path: string
  icon: LucideIcon
  ready: boolean
}

export const navGroups: { key: string; items: NavItem[] }[] = [
  {
    key: "operate",
    items: [
      { key: "overview", path: "/overview", icon: LayoutDashboard, ready: false },
      { key: "credentials", path: "/upstreams", icon: KeyRound, ready: true },
      { key: "routes", path: "/routes", icon: Waypoints, ready: true },
      { key: "balancing", path: "/balancing", icon: Scale, ready: false },
      { key: "models", path: "/models", icon: Cpu, ready: false },
      { key: "quota", path: "/quota", icon: Gauge, ready: false },
      { key: "clients", path: "/clients", icon: Network, ready: false },
    ],
  },
  {
    key: "maintain",
    items: [
      { key: "plugins", path: "/plugins", icon: Puzzle, ready: false },
      { key: "logs", path: "/logs", icon: FileText, ready: false },
      { key: "usage", path: "/usage", icon: ChartNoAxesColumn, ready: false },
      { key: "settings", path: "/settings", icon: Settings, ready: false },
      { key: "system", path: "/system", icon: Server, ready: false },
    ],
  },
]
