import { Navigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";

export default function HomeRedirectPage() {
  const { bootstrapping, getPreferredGroupId } = useAppData();

  if (bootstrapping) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const preferredGroupId = getPreferredGroupId();
  if (preferredGroupId) {
    return <Navigate to={`/groups/${preferredGroupId}`} replace />;
  }

  return <Navigate to="/groups/new" replace />;
}
