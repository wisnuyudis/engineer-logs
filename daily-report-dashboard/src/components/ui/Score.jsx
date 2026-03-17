import { T, MONO } from '../../theme/tokens';
import { KPI } from '../../utils/kpi';

export function ScoreRing({ score, size=52 }) {
  const c = KPI.color(score);
  const pct = score==null?0:score===-1?0:Math.min(100,(score/4)*100);
  const r = size/2-4, circ = 2*Math.PI*r;
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth={3.5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={3.5}
          strokeDasharray={`${pct/100*circ} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray .5s ease" }} />
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        <span style={{ fontSize:size*.22,fontWeight:800,color:c,fontFamily:MONO,lineHeight:1 }}>
          {score==null?"—":score===-1?"-1":score.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function ScoreBar({ score, showLabel=true }) {
  const c=KPI.color(score); const pct=score==null?0:score===-1?0:Math.min(100,(score/4)*100);
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
      <div style={{ flex:1,height:5,background:T.border,borderRadius:3,overflow:"hidden" }}>
        <div style={{ height:"100%",width:`${pct}%`,background:c,borderRadius:3,transition:"width .4s" }} />
      </div>
      {showLabel && <span style={{ fontSize:11,fontWeight:700,color:c,fontFamily:MONO,width:26,textAlign:"right",flexShrink:0 }}>{score==null?"—":score===-1?"-1":score.toFixed(1)}</span>}
    </div>
  );
}
