import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { T, MONO } from '../theme/tokens';
import { teamOf, isAdmin } from '../constants/taxonomy';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { Pill, Card, Modal, MHead, Tag, Btn } from './ui/Primitives';
import { LogForm } from './LogForm';
import { fmtH, fmtIDR } from '../utils/formatters';
import api from '../lib/api';
import { toast } from 'sonner';

const headerBtnStyle = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
};

function activityTone(def = {}) {
  if (def.source === 'jira') return { color: T.jira, lo: T.jiraLo };
  if (def.team === 'presales') return { color: T.violet, lo: T.violetLo };
  if (def.team === 'delivery') return { color: T.teal, lo: T.tealLo };
  return { color: T.indigoHi, lo: T.indigoLo };
}

const attachmentKind = (attachment = {}) => {
  const name = String(attachment.filename || attachment.path || '').toLowerCase();
  const mime = String(attachment.mimetype || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
  if (mime.includes('spreadsheetml') || name.endsWith('.xlsx')) return 'xlsx';
  return 'unknown';
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
};

const attachmentUrl = (attachment, mode) => `/activities/attachments/${attachment.id}/${mode}`;

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
  const [editActivity, setEditActivity] = useState(null);
  const [preview, setPreview] = useState({ open:false, loading:false, error:"", attachment:null, kind:"", objectUrl:"", blob:null, rows:[] });
  const docxPreviewRef = useRef(null);
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

  const { data, isLoading, refetch } = useQuery({
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

  useEffect(() => () => {
    if (preview.objectUrl) URL.revokeObjectURL(preview.objectUrl);
  }, [preview.objectUrl]);

  useEffect(() => {
    if (!preview.open || preview.kind !== 'docx' || !preview.blob || !docxPreviewRef.current) return;
    let cancelled = false;
    const renderDocx = async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled || !docxPreviewRef.current) return;
        docxPreviewRef.current.innerHTML = '';
        await renderAsync(preview.blob, docxPreviewRef.current, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });
      } catch {
        if (!cancelled) setPreview((prev) => ({ ...prev, error: 'Gagal me-render preview DOCX.' }));
      }
    };
    renderDocx();
    return () => { cancelled = true; };
  }, [preview.open, preview.kind, preview.blob]);

  const closePreview = () => {
    if (preview.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    setPreview({ open:false, loading:false, error:"", attachment:null, kind:"", objectUrl:"", blob:null, rows:[] });
  };

  const loadAttachmentBlob = async (attachment, mode = 'preview') => {
    const response = await api.get(attachmentUrl(attachment, mode), { responseType: 'blob' });
    return response.data;
  };

  const openPreview = async (attachment) => {
    const kind = attachmentKind(attachment);
    if (!['pdf', 'docx'].includes(kind)) {
      toast.error('Format file ini belum bisa dipreview.');
      return;
    }

    if (preview.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    setPreview({ open:true, loading:true, error:"", attachment, kind, objectUrl:"", blob:null, rows:[] });

    try {
      const blob = await loadAttachmentBlob(attachment, 'preview');
      const objectUrl = URL.createObjectURL(blob);
      setPreview({ open:true, loading:false, error:"", attachment, kind, objectUrl, blob, rows:[] });
    } catch (error) {
      setPreview({ open:true, loading:false, error:error?.response?.data?.error || 'Gagal membuka preview lampiran.', attachment, kind, objectUrl:"", blob:null, rows:[] });
    }
  };

  const downloadAttachment = async (attachment) => {
    try {
      const blob = await loadAttachmentBlob(attachment, 'download');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Gagal mengunduh lampiran.');
    }
  };

  return (
    <div>
      <style>{`
        .attachment-preview-docx {
          background:#f8fafc;
          color:#0f172a;
          border-radius:12px;
          padding:18px;
          min-height:420px;
          overflow:auto;
        }
        .attachment-preview-docx .docx-wrapper {
          background:transparent;
          padding:0;
        }
        .attachment-preview-docx .docx {
          margin:0 auto 16px;
          box-shadow:0 10px 30px rgba(15,23,42,.18);
        }
      `}</style>
      <div style={{ display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end",justifyContent:"space-between" }}>
        <div style={{ display:"flex",flexDirection:"column",gap:6,flex:1,minWidth:0 }}>
          <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
          <Pill active={filter==="all"} color={T.indigoHi} lo={T.indigoLo} onClick={()=>setFilter("all")}>Semua</Pill>
          <Pill active={filter==="synced"} color={T.jira} lo={T.jiraLo} onClick={()=>setFilter("synced")}>Sinkron Otomatis</Pill>
          <Pill active={filter==="manual"} color={T.textSec} lo={T.border} onClick={()=>setFilter("manual")}>Input Manual</Pill>
          </div>
          <div style={{ fontSize:11, color:T.textMute }}>
            Klik baris untuk melihat detail lengkap. Kolom tabel bisa diurutkan dari header.
          </div>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",justifyContent:"flex-end" }}>
          <Btn v="primary" onClick={()=>setLog(true)} style={{ justifyContent:"center" }}>
            + Log Aktivitas
          </Btn>
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
        <div style={{ overflowX:"auto" }}>
        <div style={{ minWidth:860, position:"sticky",top:0,zIndex:2,display:"grid",gridTemplateColumns:"28px 110px 170px 170px 1fr 90px 110px",gap:12,padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:T.surfaceHi,fontSize:11,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em" }}>
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
          const hasProspectInfo = Boolean(a.prName || a.leadId || a.prospectValue !== null && a.prospectValue !== undefined);

          return (
            <div key={a.id} style={{ borderBottom:`1px solid ${T.border}` }}>
              <div
                onClick={()=>toggleExpanded(a.id)}
                style={{ minWidth:860, display:"grid",gridTemplateColumns:"28px 110px 170px 170px 1fr 90px 110px",gap:12,padding:"12px 16px",alignItems:"start",cursor:"pointer",background:expanded?`${T.indigo}08`:T.surface,transition:"background .15s", }}
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
                  <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                    <Tag color={activityTone(def).color} lo={activityTone(def).lo} small>{def.label || a.actKey}</Tag>
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
                <div style={{ minWidth:860, padding:"14px 20px 16px 56px",background:T.surface }}>
                  {!isSynced && (
                    <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:12 }}>
                      <Btn
                        v="sec"
                        sz="sm"
                        onClick={(e)=>{ e.stopPropagation(); setEditActivity(a); }}
                      >
                        ✏ Edit Activity
                      </Btn>
                    </div>
                  )}
                  {a.note && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4 }}>Catatan</div>
                      <div style={{ fontSize:13,color:T.textPri,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{a.note}</div>
                    </div>
                  )}
                  {hasProspectInfo && (
                    <div style={{ marginBottom:14,padding:"13px 14px",borderRadius:12,border:`1px solid ${T.violet}30`,background:T.violetLo }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10,flexWrap:"wrap" }}>
                        <div style={{ fontSize:10,fontWeight:800,color:T.violet,textTransform:"uppercase",letterSpacing:".06em" }}>Info Prospect / Lead</div>
                        <Tag color={T.violet} lo={T.surface} small>Pipeline</Tag>
                      </div>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))",gap:12 }}>
                        <Detail label="Nama Prospect" value={a.prName} />
                        <Detail label="Lead ID" value={a.leadId} mono />
                        <Detail label="Prospect Value" value={a.prospectValue !== null && a.prospectValue !== undefined ? fmtIDR(a.prospectValue) : null} />
                      </div>
                    </div>
                  )}
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:14 }}>
                    <Detail label="User" value={a.user} />
                    <Detail label="Kategori" value={def.label || a.actKey} />
                    <Detail label="Sumber" value={isSynced ? 'Sinkron Jira' : a.source === 'telegram' ? 'Telegram Bot' : 'Manual App'} />
                    <Detail label="Topik / Judul" value={a.topic} />
                    <Detail label="Ticket ID" value={a.ticketId} mono />
                    <Detail label="Ticket Title" value={a.ticketTitle} />
                    <Detail label="Customer" value={a.customerName} />
                    <Detail label="Updated At" value={a.updatedAt ? new Date(a.updatedAt).toLocaleString('id-ID') : null} />
                  </div>
                  {a.attachments?.length > 0 && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8 }}>Lampiran</div>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:10 }}>
                        {a.attachments.map((att) => {
                          const kind = attachmentKind(att).toUpperCase();
                          return (
                            <div key={att.id} style={{ padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.surfaceHi,display:"flex",flexDirection:"column",gap:9,minWidth:0 }}>
                              <div style={{ display:"flex",alignItems:"center",gap:8,minWidth:0 }}>
                                <span style={{ fontSize:10,fontWeight:800,color:T.indigoHi,background:T.indigoLo,border:`1px solid ${T.indigo}30`,borderRadius:6,padding:"3px 7px",fontFamily:MONO,flexShrink:0 }}>{kind}</span>
                                <div style={{ minWidth:0,flex:1 }}>
                                  <div style={{ fontSize:12,color:T.textPri,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{att.filename}</div>
                                  <div style={{ fontSize:10,color:T.textMute,marginTop:2 }}>{formatBytes(att.size)}</div>
                                </div>
                              </div>
                              <div style={{ display:"flex",gap:6 }}>
                                {attachmentKind(att) !== 'xlsx' && (
                                  <Btn v="ghost" sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={(e)=>{ e.stopPropagation(); openPreview(att); }}>Preview</Btn>
                                )}
                                <Btn v="sec" sz="sm" style={{ flex:1,justifyContent:"center" }} onClick={(e)=>{ e.stopPropagation(); downloadAttachment(att); }}>Download</Btn>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
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
      <Modal open={!!editActivity} onClose={()=>setEditActivity(null)} width={560}>
        <MHead title="Edit Aktivitas" sub="Hanya aktivitas input manual yang bisa diubah" onClose={()=>setEditActivity(null)} />
        <LogForm
          user={currentUser}
          initialData={editActivity}
          submitLabel="Simpan Perubahan"
          onSave={()=>{
            refetch();
            onAdd();
            setEditActivity(null);
          }}
          onCancel={()=>setEditActivity(null)}
        />
      </Modal>
      <Modal open={preview.open} onClose={closePreview} width={980}>
        <MHead
          title="Preview Lampiran"
          sub={preview.attachment?.filename || "Dokumen"}
          onClose={closePreview}
        />
        <div style={{ display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:12,flexWrap:"wrap" }}>
          <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
            <Tag color={T.indigoHi} lo={T.indigoLo}>{preview.kind?.toUpperCase()}</Tag>
            <span style={{ fontSize:11,color:T.textMute }}>{formatBytes(preview.attachment?.size)}</span>
          </div>
          {preview.attachment && (
            <Btn v="sec" sz="sm" onClick={()=>downloadAttachment(preview.attachment)}>Download</Btn>
          )}
        </div>

        {preview.loading && (
          <div style={{ padding:30,textAlign:"center",fontSize:13,color:T.textMute }}>Memuat preview dokumen...</div>
        )}
        {!preview.loading && preview.error && (
          <div style={{ padding:18,borderRadius:10,background:T.redLo,color:T.red,fontSize:13,border:`1px solid ${T.red}30` }}>{preview.error}</div>
        )}
        {!preview.loading && !preview.error && preview.kind === 'pdf' && preview.objectUrl && (
          <iframe title="Preview PDF" src={preview.objectUrl} style={{ width:"100%",height:"72vh",border:`1px solid ${T.border}`,borderRadius:12,background:"#fff" }} />
        )}
        {!preview.loading && !preview.error && preview.kind === 'docx' && (
          <div ref={docxPreviewRef} className="attachment-preview-docx" />
        )}
      </Modal>
    </div>
  );
}

function Detail({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13,color:T.textPri,fontFamily:mono ? MONO : 'inherit',wordBreak:"break-word" }}>{value}</div>
    </div>
  );
}
