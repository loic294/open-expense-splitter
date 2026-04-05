import { useAuth0 } from "@auth0/auth0-react";
import { Outlet } from "react-router-dom";
import LoginPage from "../pages/LoginPage";

export default function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Outlet />;
}
