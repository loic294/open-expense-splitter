import { Navigate, useParams } from "react-router-dom";
import TransactionSection from "../components/TransactionSection";
import { useAppData } from "../context/AppDataContext";

export default function GroupDashboardPage() {
  const { groupId } = useParams();
  const { bootstrapping, getGroupById } = useAppData();
  const group = getGroupById(groupId);

  if (bootstrapping) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!group) {
    return <Navigate to="/" replace />;
  }

  return <TransactionSection group={group} />;
}
