export type SplitType = "equal" | "amount" | "percent";

export type TransactionColumnType =
  | "name"
  | "amount"
  | "currency"
  | "paid_by"
  | "date"
  | "category"
  | "tags"
  | "split"
  | "description"
  | "status";

export interface ProfileForm {
  name: string;
  email: string;
  picture: string;
}

export interface GroupMember {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  is_temporary?: number;
  temporary_email?: string | null;
}

export interface TemporaryMemberInput {
  id?: string;
  name: string;
  email: string;
}

export interface ContactInvite {
  id: string;
  email: string | null;
  token: string;
  status: string;
  created_at?: string;
  accepted_at?: string | null;
  invitePath: string;
  inviteUrl: string;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  owner_id: string;
  members: GroupMember[];
  canEdit: boolean;
  visibleColumns?: TransactionColumnType[];
}

export interface GroupForm {
  id?: string;
  name: string;
  emoji: string;
  memberIds: string[];
  inviteEmails: string[];
  temporaryMembers: TemporaryMemberInput[];
}

export interface SplitData {
  includedMemberIds: string[];
  values: Record<string, number>;
}

export interface CategoryTagEmojiMap {
  category: Record<string, string>;
  tag: Record<string, string>;
}

export interface Transaction {
  id: string;
  batchId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  transactionDate: string;
  category: string;
  tags: string;
  paidById: string;
  splitType: SplitType;
  splitData: SplitData;
}

export interface MemberBalance {
  memberId: string;
  paid: number;
  owed: number;
  net: number;
}

export interface SettlementStep {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export interface GroupExpenseSummary {
  totalExpenses: number;
  balances: MemberBalance[];
  settlements: SettlementStep[];
}
