/**
 * Zone Sketch engine geometry extracts.
 * Copyright © 2026 Will Flood. All rights reserved.
 * Proprietary: see ./LICENSE. This file is not relicensed by Jobs.
 * Source: FIRE-ZONE-PLAN-APP/index.html at dca2eff063f52a9980c2aed255879a65cc579379.
 * Function bodies retained verbatim. Only ES-module exports and isolated
 * CB_INSET / CB_SPAN constant declarations were added for module integration.
 */
export const CB_INSET=.045,CB_SPAN=.91;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function lerp(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}
export function proj(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return{p:{...a},t:0};const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2);return{p:lerp(a,b,t),t}}
export function segmentIntersection(a,b,c,d){const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;if(Math.abs(den)<1e-9)return null;const ca={x:c.x-a.x,y:c.y-a.y},t=(ca.x*s.y-ca.y*s.x)/den,u=(ca.x*r.y-ca.y*r.x)/den;if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6)return null;return{t:clamp(t),u:clamp(u),p:lerp(a,b,clamp(t))}}
export function pointInPoly(p,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j],hit=((a.y>p.y)!=(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x);if(hit)inside=!inside}return inside}
export function cbPlanToBoard(p,b){const w=Math.max(.001,b.x2-b.x1),h=Math.max(.001,b.y2-b.y1);return{x:CB_INSET+(p.x-b.x1)/w*CB_SPAN,y:CB_INSET+(p.y-b.y1)/h*CB_SPAN}}
export function cbBoardToPlan(p,b){const w=Math.max(.001,b.x2-b.x1),h=Math.max(.001,b.y2-b.y1);return{x:clamp(b.x1+(p.x-CB_INSET)/CB_SPAN*w),y:clamp(b.y1+(p.y-CB_INSET)/CB_SPAN*h)}}
export function cbEditProjectToSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return{t:0,p:{...a},d:Math.hypot(p.x-a.x,p.y-a.y)};const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2),q={x:a.x+dx*t,y:a.y+dy*t};return{t,p:q,d:Math.hypot(p.x-q.x,p.y-q.y)}}
