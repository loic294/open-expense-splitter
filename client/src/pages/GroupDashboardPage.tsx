import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import GroupSummaryCard from "../components/GroupSummaryCard";
import TransactionSection from "../components/TransactionSection";
import { useAppData } from "../context/AppDataContext";
import type { Transaction } from "../types";

export default function GroupDashboardPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { bootstrapping, getGroupById } = useAppData();
  const group = getGroupById(groupId);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [externalTransaction, setExternalTransaction] =
    useState<Transaction | null>(null);
  const [showInviteBanner, setShowInviteBanner] = useState(
    (location.state as { inviteAccepted?: boolean } | null)?.inviteAccepted ===
      true,
  );

  if (bootstrapping) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <span
          className="loading loading-spinner loading-lg"
          aria-hidden="true"
        />
        <span className="sr-only" role="status">
          Loading…
        </span>
      </div>
    );
  }

  if (!group) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">
        {group.emoji} {group.name}
      </h1>
      {showInviteBanner && (
        <div
          role="alert"
          aria-live="polite"
          className="alert alert-success alert-soft flex items-center justify-between"
        >
          <span>You have successfully joined the group!</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowInviteBanner(false)}
          >
            ✕
          </button>
        </div>
      )}
      {group.canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => navigate(`/groups/${group.id}/edit`)}
          >
            Group settings
          </button>
        </div>
      )}
      <GroupSummaryCard
        group={group}
        transactions={transactions}
        onReimbursementRecorded={(transaction) => {
          setTransactions((prev) => [transaction, ...prev]);
          setExternalTransaction(transaction);
        }}
      />
      <TransactionSection
        group={group}
        onTransactionsChange={setTransactions}
        externalTransaction={externalTransaction}
      />
    </div>
  );
}
