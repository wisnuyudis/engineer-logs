import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { T, MONO } from '../theme/tokens';
import { teamOf, isAdmin } from '../constants/taxonomy';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { Pill, Card, Modal, MHead } from './ui/Primitives';
import { LogForm } from './LogForm';
import { fmtH, fmtIDR } from '../utils/formatters';
import api from '../lib/api';

const headerBtnStyle = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
};

export function ActivitiesView({ currentUser, members = [], onAdd }) {
  const ACTS = useTaxonomy();
  const [logOpen, setLog] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [memberFilter, setMemberFilter] = useState("all");
  const myTeam = teamOf(currentUser.role);
  const adminView = isAdmin(currentUser.role);

  useEffect(() => {
    setPage(1);
  }, [filter, search, sortBy, sortDir, memberFilter]);

  const queryParams = useMemo(() => {
    const params = {
      page,
      pageSize: 10,
      sortBy,
      sortDir,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(adminView && memberFilter !== "all" ? { userId: memberFilter } : {}),
    };

    if (filter === "synced") return { ...params, sourceGroup: "synced" };
    if (filter === "manual") return { ...params, sourceGroup: "manual" };
    return params;
  }, [page, sortBy, sortDir, search, filter, adminView, memberFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['activities-log', queryParams],
    queryFn: async () => {
      const res = await api.get('/activities', { params: queryParams });
      return res.data;
    }
  });

  const normalized = Array.isArray(data)
    ? {
        items: data,
        meta: {
          page: 1,
          pageSize: data.length || 10,
          total: data.length,
          totalPages: 1,
        }
      }
    : (data || { items: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 } });

  const rows = normalized.items
    .map((a) => ({
      ...a,
      user: a.user?.name || a.user,
      userTeam: a.user?.team || a.userTeam,
    }))
    .filter((a) => adminView || myTeam === "all" || a.userTeam === myTeam);

  const meta = {
    page: normalized.meta?.page || 1,
    pageSize: normalized.meta?.pageSize || 10,
    total: normalized.meta?.total || rows.length,
    totalPages: normalized.meta?.totalPages || 1,
  };

  const onSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortDir(field === 'date' ? 'desc' : 'asc');
  };

  const sortMark = (field) => (
    sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  );

  const toggleExpanded = (id) => setExpandedId((prev) => prev === id ? null : id);

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
          <Pill active={filter==="all"} color={T.indigoHi} lo={T.indigoLo} onClick={()=>setFilter("all")}>Semua</Pill>
          <Pill active={filter==="synced"} color={T.jira} lo={T.jiraLo} onClick={()=>setFilter("synced")}>Sinkron Otomatis</Pill>
          <Pill active={filter==="manual"} color={T.textSec} lo={T.border} onClick={()=>setFilter("manual")}>Input Manual</Pill>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
          {adminView && (
            <select
              value={memberFilter}
              onChange={(e)=>setMemberFilter(e.target.value)}
              style={{ padding:"8px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12,outline:"none" }}
            >
              <option value="all">Semua Member</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <input
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Cari topik, ticket, note, customer..."
            style={{ width:320,maxWidth:"100%",padding:"8px 12px",borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12,outline:"none" }}
          />
        </div>
      </div>

      <Card p={0} style={{ overflow:"hidden" }}>
        <div style={{ display:"grid",gridTemplateColumns:"28px 110px 170px 170px 1fr 90px 110px",gap:12,padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:T.surfaceHi,fontSize:11,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em" }}>
          <div />
          <button style={headerBtnStyle} onClick={()=>onSort('date')}>Tanggal{sortMark('date')}</button>
          <button style={headerBtnStyle} onClick={()=>onSort('topic')}>Info{sortMark('topic')}</button>
          <button style={headerBtnStyle} onClick={()=>onSort('actKey')}>Kategori{sortMark('actKey')}</button>
          <button style={headerBtnStyle} onClick={()=>onSort('ticketTitle')}>Ringkasan{sortMark('ticketTitle')}</button>
          <button style={headerBtnStyle} onClick={()=>onSort('dur')}>Durasi{sortMark('dur')}</button>
          <button style={headerBtnStyle} onClick={()=>onSort('source')}>Sumber{sortMark('source')}</button>
        </div>

        {isLoading && (
          <div style={{ padding:28,fontSize:13,color:T.textMute,textAlign:"center" }}>Memuat activity log...</div>
        )}

        {!isLoading && rows.length === 0 && (
          <div style={{ padding:28,fontSize:13,color:T.textMute,textAlign:"center" }}>Tidak ada aktivitas untuk filter ini.</div>
        )}

        {!isLoading && rows.map((a) => {
          const def = ACTS[a.actKey] || {};
          const isSynced = a.source === 'jira';
          const expanded = expandedId === a.id;

          return (
            <div key={a.id} style={{ borderBottom:`1px solid ${T.border}` }}>
              <div
                onClick={()=>toggleExpanded(a.id)}
                style={{ display:"grid",gridTemplateColumns:"28px 110px 170px 170px 1fr 90px 110px",gap:12,padding:"12px 16px",alignItems:"start",cursor:"pointer",background:expanded?`${T.indigo}08`:T.surface }}
              >
                <div style={{ fontSize:14,color:T.textMute }}>{expanded ? '▾' : '▸'}</div>
                <div>
                  <div style={{ fontSize:12,color:T.textPri,fontFamily:MONO }}>{a.date}</div>
                  <div style={{ fontSize:10,color:T.textMute }}>{a.startTime && a.endTime ? `${a.startTime}-${a.endTime}` : a.status}</div>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12,color:T.textPri,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {a.ticketId || a.topic || '-'}
                  </div>
                  <div style={{ fontSize:10,color:T.textMute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {a.user || '-'}
                  </div>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12,color:def.color || T.textPri,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {def.label || a.actKey}
                  </div>
                  <div style={{ fontSize:10,color:T.textMute }}>{a.status}</div>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {a.ticketTitle || a.topic || '-'}
                  </div>
                  <div style={{ fontSize:10,color:T.textMute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    {a.note || a.customerName || '-'}
                  </div>
                </div>
                <div style={{ fontSize:12,color:T.textPri,fontFamily:MONO }}>{fmtH(a.dur)}</div>
                <div>
                  <span style={{ fontSize:10,fontWeight:700,color:isSynced?T.jira:T.textSec,background:isSynced?T.jiraLo:T.surfaceHi,padding:"3px 7px",borderRadius:5,border:`1px solid ${isSynced?T.jira:T.border}30` }}>
                    {isSynced ? 'SYNC' : 'MANUAL'}
                  </span>
                </div>
              </div>

              {expanded && (
                <div style={{ padding:"14px 20px 16px 56px",background:T.surface }}>
                  {a.note && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4 }}>Catatan</div>
                      <div style={{ fontSize:13,color:T.textPri,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{a.note}</div>
                    </div>
                  )}
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:14 }}>
                    <Detail label="User" value={a.user} />
                    <Detail label="Kategori" value={def.label || a.actKey} />
                    <Detail label="Sumber" value={isSynced ? 'Sinkron Jira' : a.source === 'telegram' ? 'Telegram Bot' : 'Manual App'} />
                    <Detail label="Ticket ID" value={a.ticketId} mono />
                    <Detail label="Ticket Title" value={a.ticketTitle} />
                    <Detail label="Customer" value={a.customerName} />
                    <Detail label="Prospect" value={a.prName} />
                    <Detail label="Lead ID" value={a.leadId} mono />
                    <Detail label="Prospect Value" value={a.prospectValue ? fmtIDR(a.prospectValue) : null} />
                    <Detail label="Updated At" value={a.updatedAt ? new Date(a.updatedAt).toLocaleString('id-ID') : null} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {meta.total > 0 && (
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16 }}>
          <span style={{ fontSize:12,color:T.textMute }}>
            Menampilkan {(meta.page-1)*meta.pageSize + 1} – {Math.min(meta.page*meta.pageSize, meta.total)} dari {meta.total} data
          </span>
          <div style={{ display:"flex",gap:6 }}>
            <button disabled={meta.page===1} onClick={()=>setPage((p)=>Math.max(1, p-1))}
              style={{ cursor:meta.page===1?"not-allowed":"pointer",padding:"5px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:meta.page===1?T.textMute:T.textPri }}>
              ← Prev
            </button>
            <div style={{ padding:"5px 12px",fontSize:12,color:T.textPri,display:"flex",alignItems:"center",background:T.surfaceHi,borderRadius:6,border:`1px solid ${T.border}` }}>
              {meta.page} / {meta.totalPages}
            </div>
            <button disabled={meta.page===meta.totalPages} onClick={()=>setPage((p)=>Math.min(meta.totalPages, p+1))}
              style={{ cursor:meta.page===meta.totalPages?"not-allowed":"pointer",padding:"5px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:meta.page===meta.totalPages?T.textMute:T.textPri }}>
              Next →
            </button>
          </div>
        </div>
      )}

      <Modal open={logOpen} onClose={()=>setLog(false)} width={560}>
        <MHead title="Log Aktivitas" sub={new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} onClose={()=>setLog(false)} />
        <LogForm user={currentUser} onSave={()=>{onAdd();setLog(false);}} onCancel={()=>setLog(false)} />
      </Modal>
      <button onClick={()=>setLog(true)} style={{ position:"fixed",bottom:28,right:28,width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,color:"#fff",border:"none",fontSize:22,cursor:"pointer",boxShadow:`0 4px 20px ${T.indigo}60`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,transition:"transform .15s" }}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.08)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>+</button>
    </div>
  );
}

function Detail({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13,color:T.textPri,fontFamily:mono ? MONO : 'inherit',wordBreak:"break-word" }}>{value}</div>
    </div>
  );
}
