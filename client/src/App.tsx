import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import ProtectedAppLayout from "./components/ProtectedAppLayout";
import GroupCreatePage from "./pages/GroupCreatePage";
import GroupDashboardPage from "./pages/GroupDashboardPage";
import GroupEditPage from "./pages/GroupEditPage";
import GroupInviteConfirmPage from "./pages/GroupInviteConfirmPage";
import HomeRedirectPage from "./pages/HomeRedirectPage";
import PlatformInviteConfirmPage from "./pages/PlatformInviteConfirmPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import ProfilePage from "./pages/ProfilePage";
import TermsOfServicePage from "./pages/TermsOfServicePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route element={<ProtectedAppLayout />}>
            <Route path="/" element={<HomeRedirectPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/groups/new" element={<GroupCreatePage />} />
            <Route path="/groups/:groupId" element={<GroupDashboardPage />} />
            <Route path="/groups/:groupId/edit" element={<GroupEditPage />} />
            <Route
              path="/invites/platform/:token"
              element={<PlatformInviteConfirmPage />}
            />
            <Route
              path="/invites/group/:token"
              element={<GroupInviteConfirmPage />}
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
