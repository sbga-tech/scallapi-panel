import { ChevronsUpDown, Languages, LogOut, Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavLink, Navigate, Outlet, useLocation } from "react-router"

import { navGroups } from "@/app/nav"
import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"
import { languages } from "@/i18n"
import { useSession } from "@/lib/session"

export function AppLayout() {
  const { connection } = useSession()
  const location = useLocation()
  if (!connection) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar() {
  const { t } = useTranslation()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/credentials" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                S
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">scallapi</span>
                <span className="truncate text-xs text-muted-foreground">{t("app.subtitle")}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{t(`nav.group.${group.key}`)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    {item.ready ? (
                      <SidebarMenuButton
                        tooltip={t(`nav.${item.key}`)}
                        render={<NavLink to={item.path} />}
                        isActive={location.pathname.startsWith(item.path)}
                      >
                        <item.icon />
                        <span>{t(`nav.${item.key}`)}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled tooltip={t(`nav.${item.key}`)} className="opacity-50">
                        <item.icon />
                        <span>{t(`nav.${item.key}`)}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function AccountMenu() {
  const { t, i18n } = useTranslation()
  const { connection, server, signOut } = useSession()
  const { theme, setTheme } = useTheme()
  const host = connection ? new URL(connection.base).host : ""

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{host}</span>
              <span className="truncate text-xs text-muted-foreground">
                {server.version ? t("app.version", { version: server.version }) : t("app.connected")}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{connection?.base}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun />
                {t("app.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
                  <DropdownMenuRadioItem value="light">
                    <Sun />
                    {t("app.themeLight")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon />
                    {t("app.themeDark")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor />
                    {t("app.themeSystem")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                {t("app.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={i18n.language} onValueChange={(code) => void i18n.changeLanguage(code)}>
                  {languages.map((language) => (
                    <DropdownMenuRadioItem key={language.code} value={language.code}>
                      {language.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut />
              {t("app.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
