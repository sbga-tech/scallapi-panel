import { createHashRouter, Navigate } from "react-router"

import { AppLayout } from "@/app/layout"
import { CredentialsPage } from "@/pages/credentials"
import { LoginPage } from "@/pages/login"
import { RoutesPage } from "@/pages/routes"

export const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/upstreams" replace /> },
      { path: "/upstreams", element: <CredentialsPage /> },
      { path: "/upstreams/:tab", element: <CredentialsPage /> },
      { path: "/routes", element: <RoutesPage /> },
      { path: "/routes/:name", element: <RoutesPage /> },
      { path: "*", element: <Navigate to="/upstreams" replace /> },
    ],
  },
])
