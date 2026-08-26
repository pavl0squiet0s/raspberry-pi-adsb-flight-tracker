(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MamalotyFeatures = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const RAD = Math.PI / 180;
  const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const STORAGE_KEY = "mamaloty.daily.v1";

  function haversine(lat1, lon1, lat2, lon2) {
    const dLat = (lat2-lat1)*RAD, dLon = (lon2-lon1)*RAD;
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1*RAD)*Math.cos(lat2*RAD)*Math.sin(dLon/2)**2;
    return 6371 * 2 * Math.asin(Math.sqrt(x));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2-lon1)*RAD;
    const y = Math.sin(dLon)*Math.cos(lat2*RAD);
    const x = Math.cos(lat1*RAD)*Math.sin(lat2*RAD)-Math.sin(lat1*RAD)*Math.cos(lat2*RAD)*Math.cos(dLon);
    return (Math.atan2(y,x)/RAD+360)%360;
  }
  function cardinal(degrees) { return CARDINALS[Math.round(degrees/45)%8]; }
  function look(receiver, aircraft, terrainM, antennaM) {
    if (![receiver.lat,receiver.lon,aircraft.lat,aircraft.lon].every(Number.isFinite)) return null;
    const distanceKm = haversine(receiver.lat,receiver.lon,aircraft.lat,aircraft.lon);
    const altitudeM = Number.isFinite(aircraft.alt_geom) ? aircraft.alt_geom*.3048 : Number.isFinite(aircraft.alt_baro) ? aircraft.alt_baro*.3048 : NaN;
    const observerM = (Number.isFinite(terrainM)?terrainM:0)+(Number.isFinite(antennaM)?antennaM:0);
    const elevation = Number.isFinite(altitudeM) ? Math.atan2(altitudeM-observerM,Math.max(distanceKm*1000,1))/RAD : NaN;
    const degrees = bearing(receiver.lat,receiver.lon,aircraft.lat,aircraft.lon);
    return {distanceKm, bearing:degrees, cardinal:cardinal(degrees), elevation};
  }
  function isMlat(a) { return Array.isArray(a.mlat) && a.mlat.includes("lat") && a.mlat.includes("lon"); }
  function isHelicopter(a) { return aircraftVisualClass(a)==="helicopter"; }
  function isHeavy(a) { return a.wakeCategory === "H" || a.wakeCategory === "J" || /^(A388|B74|B77|A34|A35|A33|B78|MD11|DC10|AN12|AN22)/.test(a.t||""); }
  function emergency(a) { return Boolean(a.emergency && a.emergency !== "none") || ["7500","7600","7700"].includes(String(a.squawk||"")); }
  function badges(a) {
    return [isMlat(a)&&["MLAT","mlat"],isHeavy(a)&&["HEAVY","heavy"],isHelicopter(a)&&["HELIKOPTER","helicopter"],emergency(a)&&["AWARIA","emergency"]].filter(Boolean);
  }
  function aircraftVisualClass(a) {
    const type=String(a.t||"").toUpperCase(),desc=String(a.typeDesc||"").toUpperCase();
    const military=Boolean((a.dbFlags||0)&1);
    if (/^[HT]/.test(desc)||/^(R22|R44|R66|A109|A119|A139|A149|A169|A189|B06|B407|EC|H13|H14|S76|S92|AS3|AS5|MD5)/.test(type)) return "helicopter";
    if ((military&&/^(F|EUFI|TORN|HAWK|MIR2|RFAL|JAS3|SU|MIG)/.test(type))||/^(F14|F15|F16|F18|F22|F35|EUFI|TORN|HAWK|RFAL|JAS3)/.test(type)) return "fighter";
    if (military||/^(C130|C17$|C5M|A400|KC|V22|P8$|B52|B1$|B2$|E3)/.test(type)) return "military-transport";
    if (/^(A388|B748|A225|A124|A346)/.test(type)||a.wakeCategory==="J") return "super-heavy";
    if (/^(A33|A34|A35|B74|B76|B77|B78|B79|MD11|DC10|IL96)/.test(type)||a.wakeCategory==="H") return "widebody";
    if (/^(GLF|CL[036]|C2[5-9]|C5[256]|C6[58]|LJ|FA[579]|E5|E55|P180|PC24|H25|BE4)/.test(type)) return "business-jet";
    if (/^(E1[79]|E2[79]|E290|E295|CRJ|RJ|F70|F100|SU95|ARJ)/.test(type)) return "narrowbody";
    if (/^(A31|A32|A20|A21|B73|B38|B39|B3XM|BCS|B72|B75)/.test(type)) return "narrowbody";
    if (desc.endsWith("T")||/^(AT4|AT7|DH8|SF3|SB20|F50|JS3|PC12|C208|DHC)/.test(type)) return "turboprop";
    if (desc.endsWith("P")||/^(C1|C2|C3|PA|BE|SR2|DA4|DA6|P28|DR4|M20)/.test(type)) return "light-prop";
    return "narrowbody";
  }
  function localDay(date=new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
  const ALTITUDE_CONFIRMATION_VERSION=1;
  function emptyDaily(date=new Date()) { return {day:localDay(date),seen:{},furthest:null,highest:null,altitudeCandidates:{},altitudeConfirmationVersion:ALTITUDE_CONFIRMATION_VERSION,strongest:null,mlat:{},needsMlat:{},directPosition:{},savedAt:0}; }
  function restoreDaily(storage, date=new Date()) {
    try { const data=JSON.parse(storage.getItem(STORAGE_KEY)); if (data.day===localDay(date)) { const current={...emptyDaily(date),...data,seen:data.seen||{},mlat:data.mlat||{},needsMlat:{...(data.mlat||{}),...(data.needsMlat||{})},directPosition:data.directPosition||{}}; if(data.altitudeConfirmationVersion!==ALTITUDE_CONFIRMATION_VERSION){current.highest=null;current.altitudeCandidates={};current.altitudeConfirmationVersion=ALTITUDE_CONFIRMATION_VERSION;} return current; } } catch (_) {}
    return emptyDaily(date);
  }
  function updateDaily(stats, aircraft, receiver, now=new Date(), staleSeconds=60) {
    if (stats.day!==localDay(now)) stats=emptyDaily(now);
    for (const a of aircraft) {
      if (!a.hex) continue;
      stats.seen[a.hex]=1;
      const hasPosition=[a.lat,a.lon].every(Number.isFinite) && (a.seen_pos??999)<=staleSeconds;
      if (isMlat(a) && hasPosition) { stats.mlat[a.hex]=1; stats.needsMlat[a.hex]=1; }
      else if (hasPosition) { stats.directPosition[a.hex]=1; delete stats.needsMlat[a.hex]; delete stats.mlat[a.hex]; }
      else if ((a.seen??999)<=staleSeconds && !stats.directPosition[a.hex]) stats.needsMlat[a.hex]=1;
      const distance=[a.lat,a.lon].every(Number.isFinite)?haversine(receiver.lat,receiver.lon,a.lat,a.lon):NaN;
      if (Number.isFinite(distance) && (!stats.furthest || distance>stats.furthest.value)) stats.furthest={hex:a.hex,flight:(a.flight||"").trim(),value:distance};
      const altitude=Number.isFinite(a.alt_geom)?a.alt_geom:Number.isFinite(a.alt_baro)?a.alt_baro:NaN;
      if (Number.isFinite(altitude) && (a.seen??999)<=staleSeconds) {
        const previous=stats.altitudeCandidates[a.hex], messages=Number.isFinite(a.messages)?a.messages:null, sampledAt=now.getTime();
        if (!previous || Math.abs(previous.value-altitude)>200) stats.altitudeCandidates[a.hex]={value:altitude,count:1,lastMessages:messages,sampledAt};
        else if (sampledAt-previous.sampledAt>=2000 && (messages===null || previous.lastMessages===null || messages>previous.lastMessages)) {
          const candidate=stats.altitudeCandidates[a.hex]={value:altitude,count:previous.count+1,lastMessages:messages,sampledAt};
          if (candidate.count>=3 && (!stats.highest || altitude>stats.highest.value)) stats.highest={hex:a.hex,flight:(a.flight||"").trim(),value:altitude};
        }
      }
      if (Number.isFinite(a.rssi) && (!stats.strongest || a.rssi>stats.strongest.value)) stats.strongest={hex:a.hex,flight:(a.flight||"").trim(),value:a.rssi};
    }
    return stats;
  }
  function checkpoint(stats, storage, now=Date.now(), force=false) {
    if (!force && now-(stats.savedAt||0)<300000) return false;
    stats.savedAt=now; storage.setItem(STORAGE_KEY,JSON.stringify(stats)); return true;
  }
  return {haversine,bearing,cardinal,look,isMlat,isHelicopter,isHeavy,emergency,badges,aircraftVisualClass,localDay,emptyDaily,restoreDaily,updateDaily,checkpoint,STORAGE_KEY};
});
