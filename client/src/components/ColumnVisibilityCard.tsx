import { useCallback, useState } from "react";
import type { TransactionColumnType } from "../types";

const COLUMN_OPTIONS: { id: TransactionColumnType; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "amount", label: "Amount" },
  { id: "currency", label: "Currency" },
  { id: "paid_by", label: "Paid by" },
  { id: "date", label: "Date" },
  { id: "category", label: "Category" },
  { id: "split", label: "Split" },
  { id: "description", label: "Description" },
];

interface ColumnVisibilityCardProps {
  title: string;
  description: string;
  initialVisibleColumns: TransactionColumnType[];
  saving: boolean;
  onSave: (columns: TransactionColumnType[]) => Promise<void>;
}

export default function ColumnVisibilityCard({
  title,
  description,
  initialVisibleColumns,
  saving,
  onSave,
}: ColumnVisibilityCardProps) {
  const [visibleColumns, setVisibleColumns] = useState<
    Set<TransactionColumnType>
  >(new Set(initialVisibleColumns));

  const handleToggleColumn = useCallback((columnId: TransactionColumnType) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setVisibleColumns(new Set(COLUMN_OPTIONS.map((col) => col.id)));
  }, []);

  const handleClearAll = useCallback(() => {
    setVisibleColumns(new Set());
  }, []);

  const handleSave = useCallback(async () => {
    await onSave(Array.from(visibleColumns));
  }, [visibleColumns, onSave]);

  return (
    <section className="card card-border bg-base-100 rounded-md w-full">
      <div className="card-body p-3 md:p-4 gap-3">
        <h2 className="card-title text-base">{title}</h2>
        <p className="text-sm text-base-content/70">{description}</p>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Visible columns</legend>
          <div className="flex flex-col gap-3 rounded-md border border-base-300 p-3">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={handleSelectAll}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {COLUMN_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="label cursor-pointer justify-start gap-3 p-0"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={visibleColumns.has(option.id)}
                    onChange={() => handleToggleColumn(option.id)}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Columns"}
          </button>
        </div>
      </div>
    </section>
  );
}
