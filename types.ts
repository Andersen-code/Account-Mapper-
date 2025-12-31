
export interface OrgNode {
  id: string;
  name: string;
  title: string;
  managerId?: string | null;
  department?: string;
  roleDescription?: string;
  buyingRole: 'Decision Maker' | 'Technical Influencer' | 'Internal Advocate' | 'User' | 'Unknown';
  strategicAction: string; 
  powerLevel: 'High' | 'Medium' | 'Low';
  stance: 'Supportive' | 'Neutral' | 'Resistant' | 'Unknown';
  alignmentRisk: 'High' | 'Medium' | 'Low';
  seniorityRank: number; // 1 (Highest) to 10 (Lowest) based on title
}

export interface DepartmentSummary {
  name: string;
  focus: string; 
  keyStakeholderCount: number;
  alignmentScore: number; 
}

export interface AccountAnalysis {
  accountName: string;
  executiveSummary: string;
  criticalAlignmentGaps: string[];
  strategicWins: string[];
  contacts: OrgNode[];
  departmentSummaries?: DepartmentSummary[];
}

export interface ProcessingState {
  isLoading: boolean;
  error: string | null;
  step: 'idle' | 'scanning' | 'mapping' | 'finalizing';
}
