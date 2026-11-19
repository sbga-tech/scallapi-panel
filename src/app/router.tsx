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
      { index: true, element: <Navigate to="/credentials" replace /> },
      { path: "/credentials", element: <CredentialsPage /> },
      { path: "/credentials/:tab", element: <CredentialsPage /> },
      { path: "/routes", element: <RoutesPage /> },
      { path: "/routes/:name", element: <RoutesPage /> },
      { path: "*", element: <Navigate to="/credentials" replace /> },
    ],
  },
])
