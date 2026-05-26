import { KpiNpsSummaryPanel } from './shared/KpiNpsSummaryPanel';

export function NpsReportView({ currentUser }) {
  return <KpiNpsSummaryPanel currentUser={currentUser} reportMode />;
}
