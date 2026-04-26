import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { T, MONO } from '../theme/tokens';
import { Card, Pill, Tag, Avi } from './ui/Primitives';
import api from '../lib/api';

const ACTION_GROUPS = [
  { value: 'all', label: 'Semua' },
  { value: 'auth', label: 'Auth' },
  { value: 'user', label: 'User' },
  { value: 'activity', label: 'Activity' },
  { value: 'kpi', label: 'KPI' },
  { value: 'jira', label: 'Jira' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'taxonomy', label: 'Taxonomy' },
  { value: 'invite', label: 'Invite' },
];

export function AuditTrailView({ currentUser }) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const queryParams = useMemo(() => ({
    page,
    pageSize: 20,
    ...(action !== 'all' ? { action } : {}),
    ...(entityType !== 'all' ? { entityType } : {}),
    ...(userId !== 'all' ? { userId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [page, action, entityType, userId, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: async () => {
      const { data } = await api.get('/audit', { params: queryParams });
      return data;
    },
    enabled: currentUser?.role === 'admin',
  });

  const items = data?.items || [];
  const meta = data?.meta || { page: 1, pageSize: 20, total: 0, totalPages: 1 };
  const users = data?.users || [];

  const toggleExpanded = (id) => setExpandedId((prev) => prev === id ? null : id);

  if (currentUser?.role !== 'admin') {
    return (
      <Card p={20}>
        <div style={{ fontSize:16,fontWeight:800,color:T.textPri,marginBottom:6 }}>Audit Trail</div>
        <div style={{ fontSize:12,color:T.textMute }}>Hanya administrator yang bisa melihat jejak audit aplikasi.</div>
      </Card>
    );
  }

  return (
    <div>
      <Card p={18} style={{ marginBottom:14 }}>
        <div style={{ display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:12,flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4 }}>Audit Trail</div>
            <div style={{ fontSize:16,fontWeight:800,color:T.textPri }}>Jejak perubahan penting di aplikasi</div>
          </div>
          <div style={{ fontSize:11,color:T.textMute }}>{meta.total} event tercatat</div>
        </div>
      </Card>

      <Card p={16} style={{ marginBottom:14 }}>
        <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {ACTION_GROUPS.map((item) => (
              <Pill key={item.value} active={action === item.value} color={T.indigoHi} lo={T.indigoLo} onClick={() => { setAction(item.value); setPage(1); }}>
                {item.label}
              </Pill>
            ))}
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} style={{ padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}>
              <option value="all">Semua Entity</option>
              <option value="user">User</option>
              <option value="activity">Activity</option>
              <option value="kpi_scorecard">KPI</option>
              <option value="auth_session">Auth Session</option>
              <option value="master_activity">Master Activity</option>
              <option value="jira_account">Jira Account</option>
              <option value="telegram_link">Telegram Link</option>
            </select>
            {currentUser?.role === 'admin' && (
              <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} style={{ padding:'8px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}>
                <option value="all">Semua User</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Cari action, entity, atau id..."
              style={{ minWidth:280,maxWidth:'100%',padding:'8px 12px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12 }}
            />
          </div>
        </div>
      </Card>

      <Card p={0} style={{ overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:24,color:T.textMute,textAlign:'center' }}>Memuat audit trail...</div>
        ) : items.length === 0 ? (
          <div style={{ padding:24,color:T.textMute,textAlign:'center' }}>Belum ada event audit untuk filter ini.</div>
        ) : items.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div key={item.id} style={{ borderBottom:`1px solid ${T.border}` }}>
              <button
                onClick={() => toggleExpanded(item.id)}
                style={{ width:'100%',display:'grid',gridTemplateColumns:'28px 160px 170px 1fr 130px',gap:12,padding:'12px 16px',background:expanded?`${T.indigo}08`:T.surface,border:'none',cursor:'pointer',textAlign:'left' }}
              >
                <div style={{ color:T.textMute }}>{expanded ? '▾' : '▸'}</div>
                <div>
                  <div style={{ fontSize:12,color:T.textPri,fontFamily:MONO }}>{new Date(item.createdAt).toLocaleDateString('id-ID')}</div>
                  <div style={{ fontSize:10,color:T.textMute }}>{new Date(item.createdAt).toLocaleTimeString('id-ID')}</div>
                </div>
                <div>
                  <div style={{ fontSize:12,color:T.textPri,fontWeight:700 }}>{item.action}</div>
                  <div style={{ fontSize:10,color:T.textMute }}>{item.entityType}</div>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12,color:T.textPri,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {item.user?.name || 'System'}
                  </div>
                  <div style={{ fontSize:10,color:T.textMute,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {item.user?.email || item.ipAddress || '—'}
                  </div>
                </div>
                <div>
                  <Tag color={T.textSec} lo={T.border} small>{item.entityId || '—'}</Tag>
                </div>
              </button>
              {expanded && (
                <div style={{ padding:'14px 20px 16px 56px',background:T.surface }}>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14 }}>
                    <Detail label="Action" value={item.action} />
                    <Detail label="Entity" value={item.entityType} />
                    <Detail label="Entity ID" value={item.entityId} mono />
                    <Detail label="IP" value={item.ipAddress} mono />
                    <Detail label="User Agent" value={item.userAgent} />
                  </div>
                  <JsonBlock label="Before" value={item.before} />
                  <JsonBlock label="After" value={item.after} />
                  <JsonBlock label="Metadata" value={item.metadata} />
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14 }}>
        <span style={{ fontSize:12,color:T.textMute }}>
          Menampilkan {(meta.page - 1) * meta.pageSize + 1} - {Math.min(meta.page * meta.pageSize, meta.total)} dari {meta.total}
        </span>
        <div style={{ display:'flex',gap:6 }}>
          <button disabled={meta.page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding:'6px 12px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:meta.page === 1 ? T.textMute : T.textPri }}>
            ← Prev
          </button>
          <div style={{ padding:'6px 12px',fontSize:12,color:T.textPri,background:T.surfaceHi,borderRadius:6,border:`1px solid ${T.border}` }}>
            {meta.page} / {meta.totalPages}
          </div>
          <button disabled={meta.page === meta.totalPages} onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            style={{ padding:'6px 12px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:meta.page === meta.totalPages ? T.textMute : T.textPri }}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13,color:T.textPri,fontFamily:mono ? MONO : 'inherit',wordBreak:'break-word' }}>{String(value)}</div>
    </div>
  );
}

function JsonBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4 }}>{label}</div>
      <pre style={{ margin:0,padding:12,background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11,color:T.textPri,overflowX:'auto',whiteSpace:'pre-wrap' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
