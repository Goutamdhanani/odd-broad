export interface ShopSummary {
  id: string;
  businessName: string;
  category?: string | null;
  status: 'onboarding' | 'active' | 'suspended';
  walletBalancePaise: number;
  createdAt: string;
}

export interface ContactSummary {
  id: string;
  waId: string;
  name?: string | null;
  optedIn: boolean;
  tags?: string[];
  createdAt: string;
}

export interface MessageSummary {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  status: string;
  text?: string | null;
  contactWaId?: string;
  contactName?: string | null;
  createdAt: string;
}
