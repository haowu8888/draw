import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui";
import { FullSpinner } from "@/components/common";
import { queryClient, TRPCProvider, trpcClient } from "@/lib/trpc";
import "./styles.css";

const Landing = lazy(() => import("@/pages/landing"));
const Login = lazy(() => import("@/pages/auth/login"));
const Register = lazy(() => import("@/pages/auth/register"));
const ForgotPassword = lazy(() => import("@/pages/auth/forgot-password"));
const Pricing = lazy(() => import("@/pages/pricing"));
const UserLayout = lazy(() => import("@/pages/user/layout"));
const UserDashboard = lazy(() => import("@/pages/user/dashboard"));
const UserBoards = lazy(() => import("@/pages/user/boards"));
const UserApiKey = lazy(() => import("@/pages/user/api-key"));
const UserSettings = lazy(() => import("@/pages/user/settings"));
const BoardPage = lazy(() => import("@/board/board-page"));
const SharePage = lazy(() => import("@/board/share-page"));
const EmbedPage = lazy(() => import("@/board/embed-page"));
const AdminLayout = lazy(() => import("@/pages/admin/layout"));
const AdminOverview = lazy(() => import("@/pages/admin/overview"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminOrders = lazy(() => import("@/pages/admin/orders"));
const AdminTasks = lazy(() => import("@/pages/admin/tasks"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const StatusPage = lazy(() => import("@/pages/status"));

function App() {
  return (
    <Suspense fallback={<FullSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/user" element={<UserLayout />}>
          <Route index element={<Navigate to="/user/dashboard" replace />} />
          <Route path="dashboard" element={<UserDashboard />} />
          <Route path="boards" element={<UserBoards />} />
          <Route path="api-key" element={<UserApiKey />} />
          <Route path="settings" element={<UserSettings />} />
        </Route>
        <Route path="/board/:id" element={<BoardPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/embed/:token" element={<EmbedPage />} />
        <Route path="/dashboard" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="/403" element={<StatusPage code={403} />} />
        <Route path="/500" element={<StatusPage code={500} />} />
        <Route path="*" element={<StatusPage code={404} />} />
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <TooltipProvider delay={400}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster position="top-center" richColors closeButton={false} toastOptions={{ className: "!rounded-xl !text-sm" }} />
        </TooltipProvider>
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
