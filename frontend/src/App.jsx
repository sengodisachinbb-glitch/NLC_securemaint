// App Root Component
// Configures client-side routing and provides Authentication context

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Equipment } from "./pages/Equipment";
import { WorkOrders } from "./pages/WorkOrders";
import { WorkOrderDetail } from "./pages/WorkOrderDetail";
import { PmSchedules } from "./pages/PmSchedules";
import { Actions } from "./pages/Actions";
import { Dashboard } from "./pages/Dashboard";
import { Audit } from "./pages/Audit";
import { Setup2FA } from "./pages/Setup2FA";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes inside Corporate Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Home />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/equipment"
            element={
              <ProtectedRoute>
                <Layout>
                  <Equipment />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/work-orders"
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkOrders />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/work-orders/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkOrderDetail />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/pm-schedules"
            element={
              <ProtectedRoute>
                <Layout>
                  <PmSchedules />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/actions"
            element={
              <ProtectedRoute>
                <Layout>
                  <Actions />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <Layout>
                  <Audit />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/setup-2fa"
            element={
              <ProtectedRoute>
                <Layout>
                  <Setup2FA />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

