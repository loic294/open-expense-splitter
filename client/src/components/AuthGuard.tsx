import { useAuth0 } from "@auth0/auth0-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import HomePage from "../pages/HomePage";
import LoginPage from "../pages/LoginPage";
import { isUnauthenticatedPath } from "../utils/authRoutes";

export default function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth0();
  const location = useLocation();
  const loginVariant = import.meta.env.VITE_LOGIN_VARIANT;
  const shouldUseHomePage = loginVariant === "home";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (!isUnauthenticatedPath(location.pathname)) {
      return <Navigate to="/" replace />;
    }

    return shouldUseHomePage ? <HomePage /> : <LoginPage />;
  }

  return <Outlet />;
}
