"use strict";
const COUNTS=[10,31,60,120];
function replayFixture(count,now=1700000000) {
  if(!COUNTS.includes(count))throw new Error("unsupported replay size");
  return {now,aircraft:Array.from({length:count},(_,index)=>({
    hex:index.toString(16).padStart(6,"0"),flight:`TST${String(index).padStart(3,"0")}`,
    lat:53.3811+((index%12)-6)*.035,lon:-1.4701+(Math.floor(index/12)-4)*.05,
    seen:0,seen_pos:0,alt_baro:8000+index*173,gs:180+index%80,track:(index*37)%360,
    baro_rate:(index%5-2)*128,rssi:-8-(index%38),messages:1000+index
  }))};
}
if(typeof module==="object"&&module.exports)module.exports={COUNTS,replayFixture};
