import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { T, FONT } from '../theme/tokens';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { ROLES, isAdmin, isMgr } from '../constants/taxonomy';
import { exportKpiSummaryCSV, exportKpiSummaryPDF, exportQuarterlyKpiCSV, exportQuarterlyKpiPDF } from '../utils/exports';
import { Avi, Btn, Card, Lbl } from './ui/Primitives';
import api from '../lib/api';

const getDescendantMemberIds = (rootId, members) => {
  const childrenByParent = new Map();
  for (const member of members) {
    if (!member.supervisorId) continue;
    const list = childrenByParent.get(member.supervisorId) || [];
    list.push(member);
    childrenByParent.set(member.supervisorId, list);
  }

  const result = [];
  const seen = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const currentId = stack.pop();
    const children = childrenByParent.get(currentId) || [];
    for (const child of children) {
      if (seen.has(child.id) || child.status === 'invited') continue;
      seen.add(child.id);
      result.push(child.id);
      stack.push(child.id);
    }
  }
  return result;
};

const quarterRange = (year, quarter) => {
  const ranges = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  return ranges[quarter] || ranges.Q1;
};

const reportOptions = [
  ['quarterly', 'Kinerja Kuartalan', 'Scorecard KPI 1 member, dilengkapi evidence Jira dan detail activity.'],
  ['summary', 'Ringkasan KPI Tim', 'List KPI seluruh engineer dan project manager dalam 1 quarter.'],
];

export function KpiReportView({ activities, members, currentUser }) {
  const ACTS = useTaxonomy();
  const [reportType, setReportType] = useState('quarterly');
  const [userSel, setUserSel] = useState([]);
  const [memberDDOpen, setMemberDDOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState('Q' + (Math.floor(new Date().getMonth() / 3) + 1));
  const [exporting, setExporting] = useState(false);

  const isAdminRole = isAdmin(currentUser.role);
  const isHeadRole = isMgr(currentUser.role) && !isAdminRole;
  const scopeLabel = isAdminRole ? 'Semua user' : isHeadRole ? 'Turunan saya' : 'Hanya saya';

  const scopeMembers = useMemo(() => {
    const activeMembers = members.filter((m) => m.status !== 'invited');
    if (isAdminRole) return activeMembers;
    if (isHeadRole) {
      const ids = new Set([currentUser.id, ...getDescendantMemberIds(currentUser.id, activeMembers)]);
      return activeMembers.filter((m) => ids.has(m.id));
    }
    return activeMembers.filter((m) => m.id === currentUser.id);
  }, [currentUser, isAdminRole, isHeadRole, members]);

  const selectedMember = useMemo(() => {
    if (userSel.length !== 1) return null;
    return scopeMembers.find((member) => member.id === userSel[0]) || null;
  }, [scopeMembers, userSel]);

  const selectedQuarterRange = useMemo(() => quarterRange(year, quarter), [quarter, year]);

  const selectedKpiRows = useMemo(() => {
    if (!selectedMember) return [];
    return activities.filter((activity) => {
      const ownerId = activity.userId || members.find((member) => member.name === activity.user)?.id;
      return ownerId === selectedMember.id
        && activity.date >= selectedQuarterRange[0]
        && activity.date <= selectedQuarterRange[1];
    });
  }, [activities, members, selectedMember, selectedQuarterRange]);

  const kpiSummaryUsers = useMemo(() => (
    scopeMembers
      .map((member) => {
        const role = String(member.role || '').toLowerCase();
        const group = role === 'pm' || role === 'project manager' ? 'pm' : 'engineer';
        const isSupported = ['delivery', 'se', 'engineer', 'pm', 'project manager'].includes(role);
        return { ...member, group, isSupported };
      })
      .filter((member) => member.isSupported)
  ), [scopeMembers]);

  const loadQuarterlyScorecard = async () => {
    if (!selectedMember) {
      toast.error('Pilih tepat 1 member untuk laporan kinerja kuartalan.');
      return null;
    }
    const res = await api.get(`/kpi/scorecards/${selectedMember.id}`, { params: { year, quarter } });
    if (res.data?.unsupported) {
      toast.error('Member yang dipilih belum memiliki profil KPI.');
      return null;
    }
    return res.data;
  };

  const loadSummaryScorecards = async () => {
    const results = await Promise.all(
      kpiSummaryUsers.map(async (member) => {
        try {
          const res = await api.get(`/kpi/scorecards/${member.id}`, { params: { year, quarter } });
          return { user: member, group: member.group, scorecard: res.data?.unsupported ? null : res.data };
        } catch {
          return { user: member, group: member.group, scorecard: null };
        }
      })
    );
    return results;
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      if (reportType === 'summary') {
        const items = await loadSummaryScorecards();
        const payload = { items, year, quarter };
        if (format === 'csv') exportKpiSummaryCSV(payload);
        else exportKpiSummaryPDF(payload);
        return;
      }

      const scorecard = await loadQuarterlyScorecard();
      if (!scorecard) return;
      const payload = { rows: selectedKpiRows, members, ACTS, scorecard, user: selectedMember, year, quarter };
      if (format === 'csv') exportQuarterlyKpiCSV(payload);
      else exportQuarterlyKpiPDF(payload);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Gagal membuat KPI report');
    } finally {
      setExporting(false);
    }
  };

  const renderMemberFilter = () => (
    <div className="kpi-report-field kpi-report-member">
      <Lbl>User</Lbl>
      <button
        onClick={() => setMemberDDOpen((value) => !value)}
        style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${memberDDOpen ? T.indigo : T.border}`,cursor:'pointer',fontFamily:FONT,fontSize:12,textAlign:'left',background:T.surfaceHi,color:selectedMember ? T.indigoHi : T.textSec,display:'flex',alignItems:'center',justifyContent:'space-between' }}
      >
        <span>{selectedMember?.name || scopeLabel}</span>
        <span style={{ fontSize:10,opacity:.6 }}>{memberDDOpen ? '▲' : '▼'}</span>
      </button>
      {memberDDOpen && (
        <div style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:50,marginTop:3,background:T.surface,border:`1.5px solid ${T.indigo}50`,borderRadius:9,boxShadow:'0 8px 24px rgba(0,0,0,.5)',overflow:'hidden' }}>
          <div style={{ padding:'7px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontSize:10,color:T.textMute,fontWeight:700 }}>PILIH 1 USER</span>
            {selectedMember && (
              <button onClick={() => setUserSel([])} style={{ fontSize:10,color:T.red,background:'none',border:'none',cursor:'pointer',fontFamily:FONT }}>
                Reset
              </button>
            )}
          </div>
          <div style={{ maxHeight:240,overflowY:'auto' }}>
            {scopeMembers.map((member) => {
              const selected = selectedMember?.id === member.id;
              return (
                <button
                  key={member.id}
                  onClick={() => {
                    setUserSel(selected ? [] : [member.id]);
                    setMemberDDOpen(false);
                  }}
                  style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'7px 10px',border:'none',cursor:'pointer',fontFamily:FONT,fontSize:12,textAlign:'left',background:selected ? T.indigoLo : T.surface,color:selected ? T.indigoHi : T.textSec,borderLeft:`3px solid ${selected ? T.indigo : 'transparent'}` }}
                >
                  <Avi av={member.avatar} team={member.team} sz={20} />
                  <div style={{ flex:1,overflow:'hidden' }}>
                    <div style={{ fontSize:12,fontWeight:selected ? 700 : 400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{member.name}</div>
                    <div style={{ fontSize:9,color:T.textMute }}>{ROLES[member.role]?.label || member.role}</div>
                  </div>
                  {selected && <span style={{ fontSize:11,color:T.indigo,flexShrink:0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <style>{`
        .kpi-report-options {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
          gap:12px;
          margin-bottom:14px;
        }
        .kpi-report-grid {
          display:grid;
          grid-template-columns:repeat(12,minmax(0,1fr));
          gap:12px;
          align-items:start;
        }
        .kpi-report-field {
          grid-column:span 3;
          min-width:0;
        }
        .kpi-report-member {
          grid-column:span 5;
          position:relative;
        }
        .kpi-report-actions {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          margin-top:14px;
          padding-top:12px;
          border-top:1px solid ${T.border};
        }
        @media (max-width: 860px) {
          .kpi-report-grid {
            grid-template-columns:1fr;
          }
          .kpi-report-field,
          .kpi-report-member {
            grid-column:1 / -1;
          }
        }
      `}</style>

      <div className="kpi-report-options">
        {reportOptions.map(([value, title, desc]) => (
          <button
            key={value}
            onClick={() => {
              setReportType(value);
              setMemberDDOpen(false);
            }}
            style={{ textAlign:'left',padding:'14px 15px',borderRadius:12,border:`1.5px solid ${reportType === value ? T.indigo : T.border}`,background:reportType === value ? T.indigoLo : T.surfaceHi,color:T.textPri,cursor:'pointer',fontFamily:FONT }}
          >
            <div style={{ fontSize:13,fontWeight:800,color:reportType === value ? T.indigoHi : T.textPri }}>{title}</div>
            <div style={{ fontSize:11,color:T.textMute,lineHeight:1.45,marginTop:4 }}>{desc}</div>
          </button>
        ))}
      </div>

      <Card p={16}>
        <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12,flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10,fontWeight:800,color:T.textSec,textTransform:'uppercase',letterSpacing:'.07em' }}>
              {reportType === 'quarterly' ? 'Parameter Kinerja Kuartalan' : 'Parameter Ringkasan KPI Tim'}
            </div>
            <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>
              {reportType === 'quarterly'
                ? 'Pilih 1 user dan periode quarter. Export akan memuat scorecard, evidence task/subtask/SUP, dan activity detail.'
                : 'Export KPI semua engineer dan project manager pada quarter terpilih.'}
            </div>
          </div>
          <div style={{ fontSize:11,color:T.textMute }}>Scope: {scopeLabel}</div>
        </div>

        <div className="kpi-report-grid">
          {reportType === 'quarterly' && renderMemberFilter()}
          <div className="kpi-report-field">
            <Lbl>Tahun</Lbl>
            <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())} style={{ width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }} />
          </div>
          <div className="kpi-report-field">
            <Lbl>Quarter</Lbl>
            <select value={quarter} onChange={(event) => setQuarter(event.target.value)} style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}>
              {['Q1','Q2','Q3','Q4'].map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        <div className="kpi-report-actions">
          <div style={{ fontSize:11,color:T.textMute }}>
            {reportType === 'quarterly'
              ? `${selectedKpiRows.length} aktivitas pada periode ${year} ${quarter}.`
              : `${kpiSummaryUsers.filter((member) => member.group === 'engineer').length} engineer · ${kpiSummaryUsers.filter((member) => member.group === 'pm').length} project manager akan dihitung.`}
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <Btn v="teal" sz="sm" disabled={exporting} onClick={() => handleExport('csv')}>{exporting ? 'Loading...' : 'CSV'}</Btn>
            <Btn v="ghost" sz="sm" disabled={exporting} onClick={() => handleExport('pdf')}>{exporting ? 'Loading...' : 'PDF'}</Btn>
          </div>
        </div>

        {reportType === 'quarterly' && !selectedMember && (
          <div style={{ fontSize:11,color:T.amber,marginTop:10 }}>
            Laporan kinerja kuartalan wajib memilih tepat 1 user.
          </div>
        )}
      </Card>
    </div>
  );
}
