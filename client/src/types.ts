export type SplitType = "equal" | "amount" | "percent";

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
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  owner_id: string;
  members: GroupMember[];
  canEdit: boolean;
}

export interface GroupForm {
  id?: string;
  name: string;
  emoji: string;
  memberIds: string[];
}

export interface SplitData {
  includedMemberIds: string[];
  values: Record<string, number>;
}

export interface Transaction {
  id: string;
  batchId: string;
  amount: number;
  name: string;
  description: string;
  transactionDate: string;
  category: string;
  paidById: string;
  splitType: SplitType;
  splitData: SplitData;
}
