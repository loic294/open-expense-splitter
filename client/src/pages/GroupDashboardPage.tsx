import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import GroupSummaryCard from "../components/GroupSummaryCard";
import TransactionSection from "../components/TransactionSection";
import { useAppData } from "../context/AppDataContext";
import type { Transaction } from "../types";

export default function GroupDashboardPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { bootstrapping, getGroupById } = useAppData();
  const group = getGroupById(groupId);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [externalTransaction, setExternalTransaction] =
    useState<Transaction | null>(null);

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

  return (
    <div className="flex flex-col gap-3">
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
