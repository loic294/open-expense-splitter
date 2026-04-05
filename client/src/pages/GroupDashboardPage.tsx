import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import GroupSummaryCard from "../components/GroupSummaryCard";
import TransactionSection from "../components/TransactionSection";
import { useAppData } from "../context/AppDataContext";
import type { Transaction } from "../types";

export default function GroupDashboardPage() {
  const { groupId } = useParams();
  const { bootstrapping, getGroupById } = useAppData();
  const group = getGroupById(groupId);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

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
      <GroupSummaryCard
        group={group}
        transactions={transactions}
        onReimbursementRecorded={(transaction) =>
          setTransactions((prev) => [transaction, ...prev])
        }
      />
      <TransactionSection
        group={group}
        onTransactionsChange={setTransactions}
      />
      </div>
  );
}
