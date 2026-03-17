export function fmtH(m) { const h=Math.floor(m/60),mn=m%60; return mn>0?`${h}h ${mn}m`:`${h}h`; }
export function fmtIDR(v) { if(!v||isNaN(v)) return "—"; if(v>=1e9) return `Rp ${(v/1e9).toFixed(1)}M`; if(v>=1e6) return `Rp ${(v/1e6).toFixed(0)}jt`; return `Rp ${Number(v).toLocaleString("id-ID")}`; }
