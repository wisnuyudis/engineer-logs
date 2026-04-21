import { useState } from 'react';
import { T, MONO } from '../../theme/tokens';
import { useTaxonomy } from '../../contexts/TaxonomyContext';
import { Tag } from '../ui/Primitives';
import { fmtH, fmtIDR } from '../../utils/formatters';

export function ActCard({ act }) {
  const [exp, setExp] = useState(false);
  const ACTS = useTaxonomy();
  const def = ACTS[act.actKey] || {};
  const isJira = def.source === "jira";
  const done   = act.status === "completed";
  
  return (
    <div style={{ display:"flex",cursor:"pointer",flexDirection:"column",background:exp?`${T.indigo}08`:T.surface,border:`1.5px solid ${exp?T.indigo:T.border}`,borderRadius:12,transition:"all .2s",boxShadow:exp?`0 4px 20px ${T.indigo}20`:"none" }}
      onClick={() => setExp(!exp)}
      onMouseEnter={e=>{if(!exp)e.currentTarget.style.borderColor=def.color+"50"}}
      onMouseLeave={e=>{if(!exp)e.currentTarget.style.borderColor=T.border}}>
      <div style={{ display:"flex",gap:0 }}>
      <div style={{ width:4,background:def.color||T.border,flexShrink:0,borderTopLeftRadius:10,borderBottomLeftRadius:exp?0:10 }} />
      <div style={{ flex:1,padding:"11px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
        {/* Category + Jira badge */}
        <div style={{ display:"flex",flexDirection:"column",gap:4,width:160,flexShrink:0 }}>
          <span style={{ fontSize:12,fontWeight:700,color:def.color,display:"flex",alignItems:"center",gap:4 }}>
            {def.icon} {def.label}
          </span>
          {isJira && (
            <span style={{ fontSize:10,fontWeight:700,color:T.jira,background:T.jiraLo,border:`1px solid ${T.jira}30`,borderRadius:4,padding:"1px 6px",display:"inline-flex",alignItems:"center",gap:4,width:"fit-content",fontFamily:MONO }}>
              ◈ {act.ticketId}
            </span>
          )}
        </div>
        {/* Main content */}
        <div style={{ flex:1,minWidth:160 }}>
          <div style={{ fontSize:13,fontWeight:600,color:T.textPri,marginBottom:3 }}>
            {act.ticketTitle || act.topic || act.prName || def.label}
          </div>
          <div style={{ display:"flex",gap:8,fontSize:11,color:T.textSec,flexWrap:"wrap",alignItems:"center" }}>
            <span>👤 {act.user}</span>
            {act.prId && <span style={{ fontFamily:MONO,color:T.violet,background:T.violetLo,padding:"1px 6px",borderRadius:4,fontSize:10 }}>{act.prId}</span>}
            {act.value>0 && <span style={{ color:T.green,fontWeight:600 }}>💰 {fmtIDR(act.value)}</span>}
            {act.stage && <Tag color={T.violet} lo={T.violetLo} small>{act.stage}</Tag>}
            {act.contact && <span>🏢 {act.contact}</span>}
            {!exp && act.note && <span style={{ color:T.textMute,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:280 }}>"{act.note}"</span>}
          </div>
        </div>
        {/* Right */}
        <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0 }}>
          <span style={{ padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:done?T.greenLo:T.amberLo,color:done?T.green:T.amber,border:`1px solid ${done?T.green:T.amber}30` }}>
            {done?"✓ Selesai":"⏳ Progress"}
          </span>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2 }}>
              <span style={{ fontSize:11,color:T.textMute,fontFamily:MONO }}>
                {act.startTime&&act.endTime?`${act.startTime}–${act.endTime} · `:""}{fmtH(act.dur)}
              </span>
              <span style={{ fontSize:10,color:T.textMute }}>{act.date}</span>
              {act.attachments?.length>0&&(
                <span style={{ fontSize:10,color:T.indigoHi,background:T.indigoLo,padding:"1px 7px",borderRadius:10,border:`1px solid ${T.indigo}30` }}>📎 {act.attachments.length} file</span>
              )}
            </div>
        </div>
      </div>
      </div>
      
      {/* Expanded Details Section */}
      {exp && (
        <div style={{ padding:"16px 20px",borderTop:`1px solid ${T.border}`,background:T.surface,borderBottomLeftRadius:10,borderBottomRightRadius:10 }}>
          {act.note && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4 }}>Catatan Aktivitas</div>
              <div style={{ fontSize:13,color:T.textPri,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{act.note}</div>
            </div>
          )}
          
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:16,marginBottom:act.attachments?.length>0?14:0 }}>
            {act.customerName && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Klien / Entitas</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.customerName}</div>
              </div>
            )}
            {act.contact && !act.customerName && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Kontak / Entitas</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.contact}</div>
              </div>
            )}
            {act.nps !== null && act.nps !== undefined && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Customer NPS</div>
                <div style={{ fontSize:13,color:T.amber }}>{act.nps===4?"😄 Sangat Puas":act.nps===3?"🙂 Puas":act.nps===2?"😐 Cukup":act.nps===1?"😕 Kurang":"😞 Sangat Kurang"} ({act.nps}/4)</div>
              </div>
            )}
            {act.ticketId && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Jira Ticket ID</div>
                <div style={{ fontSize:13,color:T.textPri,fontFamily:MONO }}>{act.ticketId}</div>
              </div>
            )}
            {act.ticketTitle && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Judul Tiket Jira</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.ticketTitle}</div>
              </div>
            )}
            {act.prName && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Nama Prospect</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.prName}</div>
              </div>
            )}
            {(act.prId || act.leadId) && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Lead ID</div>
                <div style={{ fontSize:13,color:T.textPri,fontFamily:MONO }}>{act.prId || act.leadId}</div>
              </div>
            )}
            {act.stage && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Presales Stage</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.stage}</div>
              </div>
            )}
            {Boolean(act.value || act.prospectValue) && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Prospect Value</div>
                <div style={{ fontSize:13,color:T.green,fontWeight:600 }}>{fmtIDR(act.value || act.prospectValue)}</div>
              </div>
            )}
            {act.topic && !act.ticketTitle && !act.prName && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Topik / Agenda</div>
                <div style={{ fontSize:13,color:T.textPri }}>{act.topic}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2 }}>Sumber Data</div>
              <div style={{ fontSize:13,color:T.textPri }}>{isJira ? "Jira Cloud" : "Manual App"}</div>
            </div>
          </div>

          {act.attachments?.length > 0 && (
            <div>
              <div style={{ fontSize:10,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8 }}>Lampiran File</div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {act.attachments.map(att => (
                  <a key={att.id} href={`${import.meta.env.VITE_API_URL||'http://localhost:4000/api'}/../${att.path}`} target="_blank" rel="noreferrer"
                    style={{ textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,color:T.textPri,fontSize:12,transition:"border-color .15s" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=T.indigo} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border} onClick={e=>e.stopPropagation()}>
                    <span style={{ fontSize:14 }}>📎</span> {att.filename}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
