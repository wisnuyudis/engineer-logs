import { useState, useMemo } from 'react';
import { T, FONT, MONO } from '../theme/tokens';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { ROLES, isAdmin, isMgr } from '../constants/taxonomy';
import { exportCSV, exportKpiSummaryCSV, exportKpiSummaryPDF, exportPDF, exportQuarterlyKpiCSV, exportQuarterlyKpiPDF } from '../utils/exports';
import { Card, Lbl, Inp, Btn, Tag, Avi } from './ui/Primitives';
import { fmtH } from '../utils/formatters';
import api from '../lib/api';
import { toast } from 'sonner';

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

export function ReportsView({ activities, members, currentUser }) {
  const ACTS = useTaxonomy();
  const [teamF, setTF] = useState('all');
  const [userSel, setUS] = useState([]); // array of member ids
  const [memberDDOpen, setMDD] = useState(false);
  const [dateFrom, setDF] = useState('');
  const [dateTo, setDT] = useState('');
  const [srcF, setSrc] = useState('all');
  const [custF, setCustF] = useState('');
  const [sortCol, setSort] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [exportMode, setExportMode] = useState('activity');
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportQuarter, setExportQuarter] = useState('Q' + (Math.floor(new Date().getMonth() / 3) + 1));
  const [exporting, setExporting] = useState(false);

  const isAdminRole = isAdmin(currentUser.role);
  const isHeadRole = isMgr(currentUser.role) && !isAdminRole;
  const isSelfOnly = !isAdminRole && !isHeadRole;
  const canExportKpiReports = isAdminRole || isHeadRole;
  const scopeLabel = isAdminRole ? 'Semua user' : isHeadRole ? 'Turunan saya' : 'Hanya saya';

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(col);
      setSortDir('asc');
    }
  };

  const scopeMembers = useMemo(() => {
    const activeMembers = members.filter((m) => m.status !== 'invited');
    if (isAdminRole) return activeMembers;
    if (isHeadRole) {
      const ids = new Set([currentUser.id, ...getDescendantMemberIds(currentUser.id, activeMembers)]);
      return activeMembers.filter((m) => ids.has(m.id));
    }
    return activeMembers.filter((m) => m.id === currentUser.id);
  }, [members, currentUser, isAdminRole, isHeadRole]);

  const teamUsers = useMemo(
    () => scopeMembers.filter((m) => teamF === 'all' || m.team === teamF),
    [scopeMembers, teamF]
  );

  const memberOptions = useMemo(
    () => teamUsers.map((m) => ({ id: m.id, name: m.name, role: m.role, avatar: m.avatar, team: m.team })),
    [teamUsers]
  );

  const allowedMemberIds = useMemo(() => new Set(scopeMembers.map((m) => m.id)), [scopeMembers]);

  const visible = useMemo(() => {
    let list = activities;
    const activityOwnerId = (a) => a.userId || members.find((m) => m.name === a.user)?.id || null;

    if (isSelfOnly) {
      list = list.filter((a) => activityOwnerId(a) === currentUser.id);
    } else {
      list = list.filter((a) => allowedMemberIds.has(activityOwnerId(a)));
      if (teamF !== 'all') list = list.filter((a) => a.userTeam === teamF);
      if (userSel.length > 0) list = list.filter((a) => userSel.includes(activityOwnerId(a)));
    }

    if (custF.trim()) list = list.filter((a) => (a.customerName || a.prName || '').toLowerCase().includes(custF.trim().toLowerCase()));
    if (srcF === 'jira') list = list.filter((a) => ACTS[a.actKey]?.source === 'jira');
    if (srcF === 'nonjira') list = list.filter((a) => ACTS[a.actKey]?.source === 'app');
    if (dateFrom) list = list.filter((a) => a.date >= dateFrom);
    if (dateTo) list = list.filter((a) => a.date <= dateTo);

    list = [...list].sort((a, b) => {
      let va;
      let vb;
      if (sortCol === 'date') {
        va = a.date;
        vb = b.date;
      } else if (sortCol === 'user') {
        va = a.user;
        vb = b.user;
      } else if (sortCol === 'dur') {
        va = a.dur;
        vb = b.dur;
      } else if (sortCol === 'cat') {
        va = ACTS[a.actKey]?.label || '';
        vb = ACTS[b.actKey]?.label || '';
      } else if (sortCol === 'status') {
        va = a.status;
        vb = b.status;
      } else if (sortCol === 'src') {
        va = ACTS[a.actKey]?.source || '';
        vb = ACTS[b.actKey]?.source || '';
      } else {
        va = '';
        vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [activities, members, allowedMemberIds, currentUser, isSelfOnly, teamF, userSel, srcF, custF, dateFrom, dateTo, sortCol, sortDir, ACTS]);

  const hasFilter = teamF !== 'all' || userSel.length > 0 || srcF !== 'all' || custF || dateFrom || dateTo;
  const selectedQuarterRange = useMemo(() => {
    const ranges = {
      Q1: [`${exportYear}-01-01`, `${exportYear}-03-31`],
      Q2: [`${exportYear}-04-01`, `${exportYear}-06-30`],
      Q3: [`${exportYear}-07-01`, `${exportYear}-09-30`],
      Q4: [`${exportYear}-10-01`, `${exportYear}-12-31`],
    };
    return ranges[exportQuarter] || ranges.Q1;
  }, [exportQuarter, exportYear]);

  const selectedKpiMember = useMemo(() => {
    if (isSelfOnly) return currentUser;
    if (userSel.length !== 1) return null;
    return members.find((member) => member.id === userSel[0]) || null;
  }, [currentUser, isSelfOnly, members, userSel]);

  const selectedKpiRows = useMemo(() => {
    if (!selectedKpiMember) return [];
    return activities.filter((activity) => {
      const ownerId = activity.userId || members.find((member) => member.name === activity.user)?.id;
      return ownerId === selectedKpiMember.id
        && activity.date >= selectedQuarterRange[0]
        && activity.date <= selectedQuarterRange[1];
    });
  }, [activities, members, selectedKpiMember, selectedQuarterRange]);

  const displayRows = exportMode === 'quarterly' ? selectedKpiRows : visible;

  const kpiSummaryUsers = useMemo(() => (
    scopeMembers
      .filter((member) => member.status !== 'invited')
      .map((member) => {
        const role = String(member.role || '').toLowerCase();
        const group = role === 'pm' || role === 'project manager' ? 'pm' : 'engineer';
        const isSupported = ['delivery', 'se', 'engineer', 'pm', 'project manager'].includes(role);
        return { ...member, group, isSupported };
      })
      .filter((member) => member.isSupported)
  ), [scopeMembers]);

  const loadQuarterlyScorecards = async () => {
    if (!selectedKpiMember) {
      toast.error('Pilih tepat 1 member untuk laporan kinerja kuartalan.');
      return null;
    }
    const res = await api.get(`/kpi/scorecards/${selectedKpiMember.id}`, { params: { year: exportYear, quarter: exportQuarter } });
    if (res.data?.unsupported) {
      toast.error('Member yang dipilih belum memiliki profil KPI.');
      return null;
    }
    return res.data;
  };

  const loadKpiSummaryScorecards = async () => {
    if (!canExportKpiReports) {
      toast.error('Laporan KPI hanya tersedia untuk admin/manager.');
      return null;
    }
    const results = await Promise.all(
      kpiSummaryUsers.map(async (member) => {
        try {
          const res = await api.get(`/kpi/scorecards/${member.id}`, { params: { year: exportYear, quarter: exportQuarter } });
          return { user: member, group: member.group, scorecard: res.data?.unsupported ? null : res.data };
        } catch {
          return { user: member, group: member.group, scorecard: null };
        }
      })
    );
    return results;
  };

  const handleExport = async (format) => {
    if (exportMode === 'activity') {
      if (format === 'csv') exportCSV(visible, members, ACTS);
      else exportPDF(visible, members, ACTS);
      return;
    }

    setExporting(true);
    try {
      if (exportMode === 'kpi-summary') {
        const items = await loadKpiSummaryScorecards();
        if (!items) return;
        const payload = { items, year: exportYear, quarter: exportQuarter };
        if (format === 'csv') exportKpiSummaryCSV(payload);
        else exportKpiSummaryPDF(payload);
        return;
      }

      const scorecard = await loadQuarterlyScorecards();
      if (!scorecard) return;
      const payload = { rows: selectedKpiRows, members, ACTS, scorecard, user: selectedKpiMember, year: exportYear, quarter: exportQuarter };
      if (format === 'csv') exportQuarterlyKpiCSV(payload);
      else exportQuarterlyKpiPDF(payload);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Gagal membuat quarterly KPI report');
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setTF('all');
    setUS([]);
    setSrc('all');
    setCustF('');
    setDF('');
    setDT('');
  };

  const renderTeamFilter = () => !isSelfOnly && (
    <div className="report-filter-field is-team">
      <Lbl>Tim</Lbl>
      <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
        {[
          ['all', 'Semua'],
          ['delivery', 'Delivery'],
          ['presales', 'Pre-Sales'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => {
              setTF(v);
              setUS([]);
              setMDD(false);
            }}
            style={{ padding:'7px 10px',borderRadius:8,border:`1px solid ${teamF === v ? T.indigo : T.border}`,cursor:'pointer',fontFamily:FONT,fontSize:12,background:teamF === v ? T.indigoLo : T.surfaceHi,color:teamF === v ? T.indigoHi : T.textSec,fontWeight:teamF === v ? 700 : 500 }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  const renderSourceFilter = () => (
    <div className="report-filter-field is-source">
      <Lbl>Source</Lbl>
      <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
        {[
          ['all', 'Semua'],
          ['jira', 'Jira saja'],
          ['nonjira', 'Non-Jira saja'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setSrc(v)}
            style={{ padding:'7px 10px',borderRadius:8,border:`1px solid ${srcF === v ? T.jira : T.border}`,cursor:'pointer',fontFamily:FONT,fontSize:12,background:srcF === v ? T.jiraLo : T.surfaceHi,color:srcF === v ? T.jira : T.textSec,fontWeight:srcF === v ? 700 : 500 }}
          >
            {v === 'jira' ? '◈ ' : ''}{l}
          </button>
        ))}
      </div>
    </div>
  );

  const renderMemberFilter = (single = false) => {
    const options = single
      ? scopeMembers.map((m) => ({ id: m.id, name: m.name, role: m.role, avatar: m.avatar, team: m.team }))
      : memberOptions;
    return !isSelfOnly && (
    <div className="report-filter-field report-member-field">
      <Lbl>{single ? 'User' : 'Member'}</Lbl>
      <button
        onClick={() => setMDD((v) => !v)}
        style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${memberDDOpen ? T.indigo : T.border}`,cursor:'pointer',fontFamily:FONT,fontSize:12,textAlign:'left',background:T.surfaceHi,color:userSel.length > 0 ? T.indigoHi : T.textSec,display:'flex',alignItems:'center',justifyContent:'space-between' }}
      >
        <span>{userSel.length === 0 ? scopeLabel : single ? (userSel.length === 1 ? (members.find((m) => m.id === userSel[0])?.name || '1 dipilih') : 'Pilih 1 user') : `${userSel.length} dipilih`}</span>
        <span style={{ fontSize:10,opacity:.6 }}>{memberDDOpen ? '▲' : '▼'}</span>
      </button>
      {memberDDOpen && (
        <div style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:50,marginTop:3,background:T.surface,border:`1.5px solid ${T.indigo}50`,borderRadius:9,boxShadow:'0 8px 24px rgba(0,0,0,.5)',overflow:'hidden' }}>
          <div style={{ padding:'7px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontSize:10,color:T.textMute,fontWeight:700 }}>{single ? 'PILIH 1 USER' : 'PILIH MEMBER'}</span>
            {userSel.length > 0 && (
              <button onClick={() => setUS([])} style={{ fontSize:10,color:T.red,background:'none',border:'none',cursor:'pointer',fontFamily:FONT }}>
                Reset
              </button>
            )}
          </div>
          <div style={{ maxHeight:220,overflowY:'auto' }}>
            {options.map((m) => {
              const sel = userSel.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setUS((p) => single ? (sel ? [] : [m.id]) : (sel ? p.filter((n) => n !== m.id) : [...p, m.id]))}
                  style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'7px 10px',border:'none',cursor:'pointer',fontFamily:FONT,fontSize:12,textAlign:'left',background:sel ? T.indigoLo : T.surface,color:sel ? T.indigoHi : T.textSec,borderLeft:`3px solid ${sel ? T.indigo : 'transparent'}` }}
                >
                  <Avi av={m.avatar} team={m.team} sz={20} />
                  <div style={{ flex:1,overflow:'hidden' }}>
                    <div style={{ fontSize:12,fontWeight:sel ? 700 : 400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize:9,color:T.textMute }}>{ROLES[m.role]?.label}</div>
                  </div>
                  {sel && <span style={{ fontSize:11,color:T.indigo,flexShrink:0 }}>✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{ padding:'6px 10px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'flex-end' }}>
            <button onClick={() => setMDD(false)} style={{ fontSize:11,color:T.indigoHi,background:T.indigoLo,border:`1px solid ${T.indigo}30`,borderRadius:5,padding:'4px 12px',cursor:'pointer',fontFamily:FONT,fontWeight:600 }}>
              Tutup
            </button>
          </div>
        </div>
      )}
      {!single && userSel.length > 0 && (
        <div style={{ display:'flex',flexWrap:'wrap',gap:4,marginTop:6 }}>
          {userSel.map((id) => {
            const member = members.find((m) => m.id === id);
            return (
              <span key={id} style={{ fontSize:10,background:T.indigoLo,color:T.indigoHi,border:`1px solid ${T.indigo}30`,borderRadius:12,padding:'2px 8px',display:'inline-flex',alignItems:'center',gap:4 }}>
                {(member?.name || 'Member').split(' ')[0]}
                <button onClick={() => setUS((p) => p.filter((x) => x !== id))} style={{ background:'none',border:'none',color:T.red,cursor:'pointer',fontSize:11,padding:0,lineHeight:1 }}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
    );
  };

  return (
    <div>
      <style>{`
        .reports-layout {
          display:block;
        }
        .report-export-top {
          margin-bottom:14px;
        }
        .report-filter-stack {
          display:flex;
          flex-direction:column;
          gap:14px;
        }
        .report-filter-row {
          display:grid;
          grid-template-columns:repeat(12,minmax(0,1fr));
          gap:12px;
          align-items:start;
        }
        .report-filter-field {
          min-width:0;
        }
        .report-filter-field.is-team,
        .report-filter-field.is-source {
          grid-column:span 4;
        }
        .report-filter-field.is-member,
        .report-member-field {
          grid-column:span 4;
          position:relative;
          z-index:20;
        }
        .report-filter-field.is-customer {
          grid-column:span 5;
        }
        .report-filter-field.is-date {
          grid-column:span 3;
        }
        .report-filter-actions {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
          justify-content:space-between;
          padding-top:12px;
          border-top:1px solid ${T.border};
        }
        @media (max-width: 980px) {
          .report-filter-row {
            grid-template-columns:1fr;
          }
          .report-filter-field,
          .report-filter-field.is-team,
          .report-filter-field.is-source,
          .report-filter-field.is-member,
          .report-filter-field.is-customer,
          .report-filter-field.is-date,
          .report-member-field {
            grid-column:1 / -1;
          }
          .report-filter-actions {
            align-items:flex-start;
            flex-direction:column;
          }
        }
      `}</style>
      <div className="report-export-top">
        <Card p={16}>
          <div style={{ fontSize:10,fontWeight:800,color:T.textSec,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>Cakupan Laporan</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10 }}>
            {[
              ['activity', 'Rekap Aktivitas', 'Gabungan log aktivitas sesuai filter dan range tanggal.'],
              ...(canExportKpiReports ? [
                ['quarterly', 'Kinerja Kuartalan', '1 member, 1 quarter, lengkap dengan KPI scorecard.'],
                ['kpi-summary', 'Ringkasan KPI Tim', 'List KPI seluruh engineer dan project manager dalam 1 quarter.'],
              ] : []),
            ].map(([value, title, desc]) => (
              <button
                key={value}
                onClick={() => {
                  setExportMode(value);
                  setMDD(false);
                  if ((value === 'quarterly' || value === 'kpi-summary') && userSel.length > 1) setUS([]);
                }}
                style={{ textAlign:'left',padding:'12px 13px',borderRadius:11,border:`1.5px solid ${exportMode === value ? T.indigo : T.border}`,background:exportMode === value ? T.indigoLo : T.surfaceHi,color:T.textPri,cursor:'pointer',fontFamily:FONT }}
              >
                <div style={{ fontSize:13,fontWeight:800,color:exportMode === value ? T.indigoHi : T.textPri }}>{title}</div>
                <div style={{ fontSize:11,color:T.textMute,lineHeight:1.45,marginTop:4 }}>{desc}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Card p={16} style={{ marginBottom:14 }}>
        <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12,flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10,fontWeight:800,color:T.textSec,textTransform:'uppercase',letterSpacing:'.07em' }}>
              {exportMode === 'activity' ? 'Filter Rekap Aktivitas' : exportMode === 'quarterly' ? 'Parameter Kinerja Kuartalan' : 'Parameter Ringkasan KPI Tim'}
            </div>
            <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>
              {exportMode === 'activity'
                ? 'Atur filter aktivitas lalu export CSV/PDF dari hasil yang terlihat.'
                : exportMode === 'quarterly'
                  ? 'Pilih 1 user dan periode quarter untuk export scorecard KPI.'
                  : 'Export KPI semua engineer dan project manager pada quarter terpilih.'}
            </div>
          </div>
          <div style={{ fontSize:11,color:T.textMute }}>
            Scope: {scopeLabel}
          </div>
        </div>

        {exportMode === 'activity' ? (
          <div className="report-filter-stack">
            <div className="report-filter-row">
              {renderTeamFilter()}
              {renderSourceFilter()}
              {renderMemberFilter(false)}
            </div>
            <div className="report-filter-row">
              <div className="report-filter-field is-customer">
                <Lbl>Customer</Lbl>
                <div style={{ position:'relative' }}>
                  <input
                    value={custF}
                    onChange={(e) => setCustF(e.target.value)}
                    placeholder="Cari nama customer..."
                    style={{ width:'100%',padding:'8px 28px 8px 10px',borderRadius:8,border:`1.5px solid ${custF ? T.indigo : T.border}`,background:T.surfaceHi,color:T.textPri,fontFamily:FONT,fontSize:12,outline:'none',boxSizing:'border-box' }}
                  />
                  {custF && (
                    <button onClick={() => setCustF('')} style={{ position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:T.textMute,cursor:'pointer',fontSize:13,padding:0,lineHeight:1 }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="report-filter-field is-date">
                <Inp label="Dari" type="date" value={dateFrom} onChange={(e) => setDF(e.target.value)} />
              </div>
              <div className="report-filter-field is-date">
                <Inp label="Sampai" type="date" value={dateTo} onChange={(e) => setDT(e.target.value)} />
              </div>
            </div>
            <div className="report-filter-actions">
              <div style={{ fontSize:11,color:T.textMute }}>
                {visible.length} aktivitas cocok dengan filter saat ini.
              </div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                {hasFilter && <Btn v="danger" sz="sm" onClick={reset}>Reset</Btn>}
                <Btn v="teal" sz="sm" disabled={exporting} onClick={() => handleExport('csv')}>CSV</Btn>
                <Btn v="ghost" sz="sm" disabled={exporting} onClick={() => handleExport('pdf')}>PDF</Btn>
              </div>
            </div>
          </div>
        ) : exportMode === 'quarterly' ? (
          <>
            <div className="report-filter-stack">
              <div className="report-filter-row">
              {renderMemberFilter(true)}
              <div className="report-filter-field is-date">
                <Lbl>Tahun</Lbl>
                <input type="number" value={exportYear} onChange={(event) => setExportYear(Number(event.target.value) || new Date().getFullYear())} style={{ width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }} />
              </div>
              <div className="report-filter-field is-date">
                <Lbl>Quarter</Lbl>
                <select value={exportQuarter} onChange={(event) => setExportQuarter(event.target.value)} style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}>
                  {['Q1','Q2','Q3','Q4'].map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}
                </select>
              </div>
              </div>
              <div className="report-filter-actions">
                <div style={{ fontSize:11,color:T.textMute }}>
                  {selectedKpiRows.length} aktivitas pada periode {exportYear} {exportQuarter}.
                </div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  <Btn v="teal" sz="sm" disabled={exporting} onClick={() => handleExport('csv')}>CSV</Btn>
                  <Btn v="ghost" sz="sm" disabled={exporting} onClick={() => handleExport('pdf')}>PDF</Btn>
                </div>
              </div>
            </div>
            {!isSelfOnly && (
              <div style={{ fontSize:11,color:selectedKpiMember ? T.textMute : T.amber,marginTop:10 }}>
                Laporan kinerja kuartalan wajib memilih tepat 1 user.
              </div>
            )}
          </>
        ) : (
          <div className="report-filter-stack">
            <div className="report-filter-row">
              <div className="report-filter-field is-date">
                <Lbl>Tahun</Lbl>
                <input type="number" value={exportYear} onChange={(event) => setExportYear(Number(event.target.value) || new Date().getFullYear())} style={{ width:'100%',boxSizing:'border-box',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }} />
              </div>
              <div className="report-filter-field is-date">
                <Lbl>Quarter</Lbl>
                <select value={exportQuarter} onChange={(event) => setExportQuarter(event.target.value)} style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}>
                  {['Q1','Q2','Q3','Q4'].map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}
                </select>
              </div>
            </div>
            <div className="report-filter-actions">
              <div style={{ fontSize:11,color:T.textMute }}>
                {kpiSummaryUsers.filter((member) => member.group === 'engineer').length} engineer · {kpiSummaryUsers.filter((member) => member.group === 'pm').length} project manager akan dihitung.
              </div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                <Btn v="teal" sz="sm" disabled={exporting} onClick={() => handleExport('csv')}>{exporting ? 'Loading...' : 'CSV'}</Btn>
                <Btn v="ghost" sz="sm" disabled={exporting} onClick={() => handleExport('pdf')}>{exporting ? 'Loading...' : 'PDF'}</Btn>
              </div>
            </div>
          </div>
        )}
      </Card>
      <div className="reports-layout">
        <Card p={16} style={{ display:'none' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>Filter</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Lbl>Scope</Lbl>
              <div style={{ padding: '8px 10px', borderRadius: 7, background: T.surfaceHi, border: `1px solid ${T.border}`, fontSize: 12, color: T.textSec, lineHeight: 1.45 }}>
                {isAdminRole && 'Admin dapat melihat dan generate report seluruh data.'}
                {isHeadRole && 'Head dapat melihat dan generate report untuk turunan langsung dan tidak langsung.'}
                {isSelfOnly && 'Anda hanya dapat melihat dan generate report diri sendiri.'}
              </div>
            </div>

            {!isSelfOnly && (
              <div>
              <Lbl>Tim</Lbl>
              {[
                ['all', 'Semua'],
                ['delivery', 'Delivery'],
                ['presales', 'Pre-Sales'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    setTF(v);
                    setUS([]);
                    setMDD(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 7,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: FONT,
                    fontSize: 12,
                    textAlign: 'left',
                    marginBottom: 3,
                    background: teamF === v ? T.indigoLo : T.surfaceHi,
                    color: teamF === v ? T.indigoHi : T.textSec,
                    fontWeight: teamF === v ? 700 : 400,
                    borderLeft: teamF === v ? `2px solid ${T.indigo}` : '2px solid transparent',
                  }}
                >
                  {l}
                </button>
              ))}
              </div>
            )}

            <div>
              <Lbl>Source</Lbl>
              {[
                ['all', 'Semua'],
                ['jira', 'Jira saja'],
                ['nonjira', 'Non-Jira saja'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setSrc(v)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 7,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: FONT,
                    fontSize: 12,
                    textAlign: 'left',
                    marginBottom: 3,
                    background: srcF === v ? T.jiraLo : T.surfaceHi,
                    color: srcF === v ? T.jira : T.textSec,
                    fontWeight: srcF === v ? 700 : 400,
                  }}
                >
                  {v === 'jira' ? '◈ ' : ''}
                  {l}
                </button>
              ))}
            </div>

            {!isSelfOnly && (
              <div style={{ position: 'relative' }}>
                <Lbl>Member</Lbl>
                <button
                  onClick={() => setMDD((v) => !v)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 7,
                    border: `1.5px solid ${memberDDOpen ? T.indigo : T.border}`,
                    cursor: 'pointer',
                    fontFamily: FONT,
                    fontSize: 12,
                    textAlign: 'left',
                    background: T.surfaceHi,
                    color: userSel.length > 0 ? T.indigoHi : T.textSec,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color .15s',
                  }}
                >
                  <span>{userSel.length === 0 ? scopeLabel : `${userSel.length} dipilih`}</span>
                  <span style={{ fontSize: 10, opacity: .6 }}>{memberDDOpen ? '▲' : '▼'}</span>
                </button>
                {memberDDOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      marginTop: 3,
                      background: T.surface,
                      border: `1.5px solid ${T.indigo}50`,
                      borderRadius: 9,
                      boxShadow: '0 8px 24px rgba(0,0,0,.5)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '7px 10px',
                        borderBottom: `1px solid ${T.border}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 10, color: T.textMute, fontWeight: 700 }}>PILIH MEMBER</span>
                      {userSel.length > 0 && (
                        <button
                          onClick={() => setUS([])}
                          style={{
                            fontSize: 10,
                            color: T.red,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {memberOptions.map((m) => {
                        const sel = userSel.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => setUS((p) => (sel ? p.filter((n) => n !== m.id) : [...p, m.id]))}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '7px 10px',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: FONT,
                              fontSize: 12,
                              textAlign: 'left',
                              background: sel ? T.indigoLo : T.surface,
                              color: sel ? T.indigoHi : T.textSec,
                              borderLeft: `3px solid ${sel ? T.indigo : 'transparent'}`,
                              transition: 'all .1s',
                            }}
                          >
                            <Avi av={m.avatar} team={m.team} sz={20} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 12, fontWeight: sel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                              <div style={{ fontSize: 9, color: T.textMute }}>{ROLES[m.role]?.label}</div>
                            </div>
                            {sel && <span style={{ fontSize: 11, color: T.indigo, flexShrink: 0 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setMDD(false)}
                        style={{
                          fontSize: 11,
                          color: T.indigoHi,
                          background: T.indigoLo,
                          border: `1px solid ${T.indigo}30`,
                          borderRadius: 5,
                          padding: '4px 12px',
                          cursor: 'pointer',
                          fontFamily: FONT,
                          fontWeight: 600,
                        }}
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                )}
                {userSel.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {userSel.map((id) => {
                      const member = members.find((m) => m.id === id);
                      return (
                        <span
                          key={id}
                          style={{
                            fontSize: 10,
                            background: T.indigoLo,
                            color: T.indigoHi,
                            border: `1px solid ${T.indigo}30`,
                            borderRadius: 12,
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {(member?.name || 'Member').split(' ')[0]}
                          <button
                            onClick={() => setUS((p) => p.filter((x) => x !== id))}
                            style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <Lbl>Customer</Lbl>
              <div style={{ position: 'relative' }}>
                <input
                  value={custF}
                  onChange={(e) => setCustF(e.target.value)}
                  placeholder="Cari nama customer..."
                  style={{
                    width: '100%',
                    padding: '6px 28px 6px 9px',
                    borderRadius: 7,
                    border: `1.5px solid ${custF ? T.indigo : T.border}`,
                    background: T.surfaceHi,
                    color: T.textPri,
                    fontFamily: FONT,
                    fontSize: 12,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {custF && (
                  <button
                    onClick={() => setCustF('')}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: T.textMute,
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Inp label="Dari" type="date" value={dateFrom} onChange={(e) => setDF(e.target.value)} />
              <Inp label="Sampai" type="date" value={dateTo} onChange={(e) => setDT(e.target.value)} />
            </div>

            {hasFilter && (
              <Btn v="danger" sz="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={reset}>
                × Reset Filter
              </Btn>
            )}
          </div>
        </Card>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.textPri }}>{displayRows.length} baris</span>
            {[
              teamF !== 'all' && teamF,
              ...userSel.map((id) => members.find((m) => m.id === id)?.name?.split(' ')[0] || id),
              exportMode === 'activity' && srcF !== 'all' && srcF,
              exportMode === 'activity' && dateFrom && `≥${dateFrom}`,
              exportMode === 'activity' && dateTo && `≤${dateTo}`,
              exportMode === 'quarterly' && `${exportYear} ${exportQuarter}`,
              exportMode === 'kpi-summary' && `KPI Summary ${exportYear} ${exportQuarter}`,
            ]
              .filter(Boolean)
              .map((f, i) => (
                <Tag key={i} color={T.indigoHi} lo={T.indigoLo}>
                  {f}
                </Tag>
              ))}
          </div>
          <Card p={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surfaceHi }}>
                    {[
                      { label: 'Tanggal', col: 'date' },
                      { label: 'Member', col: 'user' },
                      { label: 'Source', col: 'src' },
                      { label: 'Kategori', col: 'cat' },
                      { label: 'Aktivitas / Ticket', col: null },
                      { label: 'Customer', col: 'cust' },
                      { label: 'Waktu', col: 'dur' },
                      { label: 'Status', col: 'status' },
                    ].map(({ label, col }) => (
                      <th
                        key={label}
                        onClick={col ? () => toggleSort(col) : undefined}
                        style={{
                          padding: '9px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '.05em',
                          whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${T.border}`,
                          cursor: col ? 'pointer' : 'default',
                          userSelect: 'none',
                          color: col && sortCol === col ? T.indigoHi : T.textMute,
                          background: col && sortCol === col ? `${T.indigo}10` : 'transparent',
                          transition: 'all .15s',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {label}
                          {col && (
                            <span style={{ fontSize: 10, opacity: sortCol === col ? 1 : .3, color: T.indigoHi }}>
                              {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: T.textMute }}>
                        Tidak ada data.
                      </td>
                    </tr>
                  )}
                  {displayRows.map((a, i) => {
                    const def = ACTS[a.actKey] || {};
                    const done = a.status === 'completed';
                    const m = members.find((x) => x.id === a.userId) || members.find((x) => x.name === a.user);
                    return (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.surface : T.surfaceHi }}>
                        <td style={{ padding: '8px 12px', color: T.textMute, fontFamily: MONO, fontSize: 11 }}>{a.date}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {m && <Avi av={m.avatar} team={m.team} sz={20} />}
                            <span style={{ color: T.textSec }}>{a.user}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {def.source === 'jira' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.jira, background: T.jiraLo, padding: '2px 7px', borderRadius: 5, fontFamily: MONO }}>◈ Jira</span>
                          ) : (
                            <span style={{ fontSize: 11, color: T.textMute }}>App</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Tag color={activityTone(def).color} lo={activityTone(def).lo} small>{def.icon} {def.label}</Tag>
                        </td>
                        <td style={{ padding: '8px 12px', color: T.textPri, maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.ticketId && <span style={{ color: T.jira, fontFamily: MONO, fontSize: 10, marginRight: 5 }}>{a.ticketId}</span>}
                            {a.ticketTitle || a.topic || a.prName || def.label}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: 150 }}>
                          {a.customerName || a.prName ? (
                            <span style={{ fontSize: 11, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                              {a.customerName || a.prName}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: T.textMute }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: T.textSec, fontFamily: MONO, fontSize: 11, whiteSpace: 'nowrap' }}>
                          <div>{a.startTime && a.endTime ? `${a.startTime}–${a.endTime}` : ''}</div>
                          <div style={{ color: T.textMute, fontSize: 10 }}>{fmtH(a.dur)}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: done ? T.green : T.amber }}>{done ? '✓ Selesai' : '⏳ Progress'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
function activityTone(def = {}) {
  if (def.source === 'jira') return { color: T.jira, lo: T.jiraLo };
  if (def.team === 'presales') return { color: T.violet, lo: T.violetLo };
  if (def.team === 'delivery') return { color: T.teal, lo: T.tealLo };
  return { color: T.indigoHi, lo: T.indigoLo };
}
