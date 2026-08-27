(() => {
  "use strict";
  const cfg = window.FLIGHT_TRACKER_CONFIG;
  const features = window.MamalotyFeatures;
  const visualDefaults = {aircraftColor:"#2563a8",trailWidth:4,trailColorMode:"airline",aircraftSize:48,startupZoom:8};
  const visualSettingsVersion = "3";
  function restoreVisualSettings() {
    try {
      const saved=JSON.parse(localStorage.getItem("mamaloty.visual-settings"));
      if(localStorage.getItem("mamaloty.visual-settings-version")!==visualSettingsVersion) Object.assign(saved,{aircraftColor:visualDefaults.aircraftColor,trailWidth:visualDefaults.trailWidth,trailColorMode:visualDefaults.trailColorMode,startupZoom:visualDefaults.startupZoom});
      return {...visualDefaults,...saved};
    }
    catch (_) { return {...visualDefaults}; }
  }
  let visualSettings=restoreVisualSettings();
  const runtimeMode = new URLSearchParams(window.location.search).get("mode") || cfg.mode;
  const $ = (id) => document.getElementById(id);
  const state = { selected: null, aircraft: new Map(), markers: new Map(), trails: new Map(), trailColors: new Map(), lines: new Map(), db: new Map(), types: null, routes: new Map(), aircraftInfo: new Map(), daily:features.restoreDaily(localStorage), mlatConfig:null, savedReceiver:null, unpositionedCount:0, remotePositions:new Map(), nearbyHelicopters:new Map(), positionLookupAt:0, nearbyLookupAt:0, enrichmentLookupAt:0 };
  const performanceSamples={refresh:[],trails:[],enrichment:[],longTasks:[],counters:{refreshCoalesced:0,enrichmentCoalesced:0,wifiCoalesced:0,mlatCoalesced:0},selectionLatency:[]};
  const recordPerformance=(name,started)=>{const samples=performanceSamples[name],duration=performance.now()-started;samples.push(Math.round(duration));if(samples.length>60)samples.shift();};
  if(globalThis.PerformanceObserver)try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){performanceSamples.longTasks.push(Math.round(entry.duration));if(performanceSamples.longTasks.length>60)performanceSamples.longTasks.shift();}}).observe({type:"longtask",buffered:true});}catch(_){}
  window.MamalotyPerformance={samples:performanceSamples,snapshot:()=>structuredClone(performanceSamples)};
  const translateUi=root=>window.MamalotyI18n.apply(root);
  const dialogOpen=()=>Boolean(document.querySelector('[role="dialog"]:not(.hidden)'));
  const airlines = {
    AAL:"American Airlines", AFR:"Air France", AUA:"Austrian Airlines", BAW:"British Airways",
    BEL:"Brussels Airlines", BTI:"airBaltic", DLH:"Lufthansa", EIN:"Aer Lingus",
    EJU:"easyJet Europe", EZY:"easyJet", EXS:"Jet2.com", FIN:"Finnair", IBE:"Iberia",
    ICE:"Icelandair", KLM:"KLM", LOT:"LOT Polish Airlines", LOG:"Loganair", NSZ:"Norwegian",
    QTR:"Qatar Airways", RYR:"Ryanair", SAS:"Scandinavian Airlines", SWR:"SWISS",
    TAP:"TAP Air Portugal", THY:"Turkish Airlines", TOM:"TUI Airways", UAE:"Emirates",
    UAL:"United Airlines", VIR:"Virgin Atlantic", VLG:"Vueling", WUK:"Wizz Air UK", WZZ:"Wizz Air"
  };
  const airlineColors = {
    AAL:"#c8102e", AFR:"#e00034", AUA:"#d81e05", BAW:"#2e5da8", BEL:"#e21b2d",
    BTI:"#9acd32", DLH:"#f9ba00", EIN:"#169b62", EJU:"#ff6600", EZY:"#ff6600",
    EXS:"#e31b23", FIN:"#0b65c2", IBE:"#d7192d", ICE:"#e6a817", KLM:"#00a1de",
    LOG:"#4c9f38", LOT:"#2455a4", NSZ:"#e51b23", QTR:"#8a1b61", RYR:"#f1c933",
    SAS:"#1565a7", SWR:"#d52b1e", TAP:"#75b843", THY:"#d71920", TOM:"#70c9d4",
    UAE:"#d71920", UAL:"#2474b5", VIR:"#d50032", VLG:"#f4c300", WUK:"#c6007e", WZZ:"#c6007e"
  };
  const passengerCapacity = {
    A319:"124–156", A320:"150–186", A20N:"150–194", A321:"180–236", A21N:"180–244",
    A332:"246–300", A333:"277–335", A338:"257–300", A339:"287–310", A359:"300–350", A35K:"350–410", A388:"484–853",
    B737:"126–149", B738:"162–189", B739:"178–220", B38M:"162–210", B39M:"178–220",
    B752:"178–239", B753:"216–295", B763:"214–269", B764:"243–304", B772:"301–368", B773:"368–550", B77W:"350–396",
    B788:"242–290", B789:"290–330", B78X:"318–336", E170:"66–78", E175:"76–88", E190:"96–114", E195:"100–124",
    E290:"97–114", E295:"120–146", CRJ7:"66–78", CRJ9:"76–90", CRJX:"86–104", AT72:"68–78", DH8D:"74–90",
    LJ60:"7–8", C25A:"7", C525:"6–7", C550:"7–10", CL60:"10–19", GLF5:"14–19", P180:"7–9"
  };

  let mapBusy=false;
  function cacheRenderedTiles(layer, limit=96) {
    if (!globalThis.createImageBitmap) return layer;
    const cache=new Map(),createTile=layer.createTile.bind(layer);
    layer.createTile=(coords,done) => {
      const key=`${coords.z}/${coords.x}/${coords.y}`,cached=cache.get(key);
      if(cached) {
        cache.delete(key); cache.set(key,cached);
        const canvas=L.DomUtil.create("canvas","leaflet-tile");
        canvas.lang=window.MamalotyI18n.language; canvas.width=layer.tileSize; canvas.height=layer.tileSize;
        canvas.getContext("2d").drawImage(cached,0,0);
        queueMicrotask(()=>done(undefined,canvas)); return canvas;
      }
      return createTile(coords,(error,canvas)=>{
        done(error,canvas);
        if(error||!canvas.width)return;
        createImageBitmap(canvas).then(bitmap=>{
          const previous=cache.get(key); if(previous)previous.close();
          cache.set(key,bitmap);
          while(cache.size>limit){const oldest=cache.keys().next().value;cache.get(oldest).close();cache.delete(oldest);}
        }).catch(()=>{});
      });
    };
    return layer;
  }
  function fastOfflineLayer(url) {
    const layer=protomapsL.leafletLayer({
      url,flavor:"light",lang:window.MamalotyI18n.language,
      updateWhenZooming:false,updateWhenIdle:true,keepBuffer:3,tileDelay:1
    });
    // The kiosk only zooms to z12: omit expensive building, footpath and minor
    // land-use passes intended for street-level maps, while retaining terrain,
    // water, useful land use, all road classes and administrative boundaries.
    const paintRules=new Set([0,1,2,3,5,9,10,11,14,15,16,17,26,27,28,29,31]);
    const labelRules=new Set([1,3,4,5,6,7,8]);
    layer.paintRules=layer.paintRules.filter((_,index)=>paintRules.has(index));
    layer.labelRules=layer.labelRules.filter((_,index)=>labelRules.has(index));
    layer.clearLayout();
    return cacheRenderedTiles(layer);
  }

  const map = L.map("map", {
    center: [cfg.receiver.lat, cfg.receiver.lon], zoom: visualSettings.startupZoom,
    minZoom: cfg.minZoom, maxZoom: cfg.maxZoom,
    zoomControl: false, attributionControl: false,
    zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false
  });
  L.control.zoom({position: "bottomright"}).addTo(map);
  if (runtimeMode.endsWith("-offline")) {
    const mapName = runtimeMode.slice(0, -"-offline".length);
    if(mapName==="sheffield") {
      const bounds=L.latLngBounds([50.72,-5.93],[56.12,3.07]);
      const rasterUrl=`/maps/sheffield-raster-${window.MamalotyI18n.language}/{z}/{x}/{y}.webp?v=20260823-browser`;
      const rasterLayer=L.tileLayer(rasterUrl,{
        minZoom:cfg.minZoom,maxZoom:cfg.maxZoom,bounds,noWrap:true,
        updateWhenZooming:false,updateWhenIdle:true,keepBuffer:1
      }).addTo(map);
      map.setMaxBounds(bounds.pad(-.01));
      // Each zoom uses different files. Once the initial view is ready, warm
      // the immediately adjacent levels so the first +/- button press does not
      // wait for cold SD-card reads and WebP decoding.
      const warmZoom=async zoom=>{
        if(zoom<cfg.minZoom||zoom>cfg.maxZoom)return;
        const scale=2**zoom,lat=cfg.receiver.lat*Math.PI/180;
        const centerX=Math.floor((cfg.receiver.lon+180)/360*scale);
        const centerY=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*scale);
        const radiusX=Math.ceil(window.innerWidth/512)+1;
        const radiusY=Math.ceil(window.innerHeight/512)+1;
        const urls=[];
        for(let x=centerX-radiusX;x<=centerX+radiusX;x++)for(let y=centerY-radiusY;y<=centerY+radiusY;y++)
          urls.push(rasterUrl.replace("{z}",zoom).replace("{x}",x).replace("{y}",y));
        let next=0;
        await Promise.all(Array.from({length:4},async()=>{
          while(next<urls.length){const url=urls[next++];try{await fetch(url,{cache:"force-cache"});}catch(_){}}
        }));
      };
      let warmGeneration=0,warmTimer;
      const scheduleWarm=(delay=2000)=>{clearTimeout(warmTimer);const generation=++warmGeneration;warmTimer=setTimeout(async()=>{
        if(generation!==warmGeneration||dialogOpen()){scheduleWarm(3000);return;}
        await warmZoom(map.getZoom()-1);
        if(generation===warmGeneration&&!dialogOpen())await warmZoom(map.getZoom()+1);
      },delay);};
      addEventListener("pointerdown",()=>scheduleWarm(3000),{passive:true});
      rasterLayer.once("load",()=>scheduleWarm());
    } else fastOfflineLayer(`/maps/${mapName}.pmtiles`).addTo(map);
  } else {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: cfg.minZoom, maxZoom: cfg.maxZoom,
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);
  }
  const receiverRange=L.circle([cfg.receiver.lat, cfg.receiver.lon], {
    radius: cfg.maxRangeKm * 1000, color: "#64748b", weight: 1, opacity: .6,
    fill: false, dashArray: "5 7", interactive: false
  }).addTo(map);
  const receiverMarker=L.circleMarker([cfg.receiver.lat, cfg.receiver.lon], {
    radius: 6, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1,
    interactive: false
  }).addTo(map);
  map.on("movestart zoomstart",()=>{
    mapBusy=true;
    // Do not leave geographically transformed trails on screen while marker
    // visibility is being recalculated for a new viewport.
    for(const lines of state.lines.values())lines.forEach((line)=>line.setLatLngs([]));
  });
  map.on("moveend zoomend",()=>{
    mapBusy=false;
    updateTrails(Date.now()/1000,true);
  });
  function applyReceiverLocation(config,recenter=false) {
    const lat=config?.receiver_lat,lon=config?.receiver_lon;
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    const changed=lat!==cfg.receiver.lat||lon!==cfg.receiver.lon;
    cfg.receiver.lat=lat; cfg.receiver.lon=lon;
    receiverRange.setLatLng([lat,lon]); receiverMarker.setLatLng([lat,lon]);
    if(changed||recenter)map.setView([lat,lon],map.getZoom());
  }

  const iconPaths = window.MamalotyAircraftIcons;
  const iconDiagnostics = [
    ["helicopter","Helikopter","Wirnikowce: R22/R44/R66, H135/H145, A109 i S-76."],
    ["fighter","Myśliwiec","Szybkie wojskowe samoloty bojowe: F-15, F-16, F-35, Typhoon, Rafale i Hawk."],
    ["military-transport","Wojskowy / transportowy","Transportowce, tankowce i samoloty patrolowe: C-130, C-17, A400M, KC-135 i P-8."],
    ["light-prop","Lekki śmigłowy","Małe samoloty tłokowe: Cessna 172/182, Piper, Cirrus i Diamond."],
    ["turboprop","Turbośmigłowy","ATR 42/72, Dash 8, Saab 340 i PC-12."],
    ["business-jet","Odrzutowiec biznesowy","Gulfstream, Citation, Learjet, Falcon, Challenger i Embraer Legacy."],
    ["narrowbody","Odrzutowiec pasażerski","Samoloty regionalne i wąskokadłubowe: Embraer E-Jets, CRJ, Airbus A220/A320/A321 oraz Boeing 737/757."],
    ["widebody","Szerokokadłubowy liniowiec","Duże samoloty dalekodystansowe: A330/A350 oraz Boeing 767/777/787 i 747."],
    ["super-heavy","Superciężki","Największe konstrukcje: Airbus A380, Boeing 747-8 oraz Antonow An-124/225."]
  ];
  function renderIconDiagnostics() {
    let performanceBox=$("performance-diagnostics");
    if(!performanceBox){const section=document.createElement("section"),heading=document.createElement("h3");section.className="performance-diagnostics";performanceBox=document.createElement("pre");performanceBox.id="performance-diagnostics";heading.textContent="Responsywność";section.append(heading,performanceBox);$("test-dialog").querySelector(".receiver-location").before(section);}
    const percentile=samples=>samples.length?[...samples].sort((a,b)=>a-b)[Math.floor((samples.length-1)*.95)]:0;
    performanceBox.textContent=[`Odświeżanie p95: ${percentile(performanceSamples.refresh)} ms`,`Ślady p95: ${percentile(performanceSamples.trails)} ms`,`Dane lotu p95: ${percentile(performanceSamples.enrichment)} ms`,`Długie zadania: ${performanceSamples.longTasks.length}`,`Trasa po dotknięciu p95: ${percentile(performanceSamples.selectionLatency)} ms`,`Scalone żądania: ${Object.values(performanceSamples.counters).reduce((sum,value)=>sum+value,0)}`].join("\n");
    const svgNamespace = "http://www.w3.org/2000/svg";
    $("icon-diagnostics").replaceChildren(...iconDiagnostics.map(([key,title,description]) => {
      const item=document.createElement("article"); item.className="icon-diagnostic";
      const svg=document.createElementNS(svgNamespace,"svg"); svg.setAttribute("viewBox","0 0 32 32"); svg.setAttribute("aria-hidden","true");
      const path=document.createElementNS(svgNamespace,"path"); path.setAttribute("fill","currentColor"); path.setAttribute("d",iconPaths[key]); svg.append(path);
      const copy=document.createElement("div"), heading=document.createElement("h3"), detail=document.createElement("p");
      heading.textContent=title; detail.textContent=description; copy.append(heading,detail); item.append(svg,copy); return item;
    }));
    translateUi($("icon-diagnostics"));
    translateUi(performanceBox.parentElement);
  }
  function aircraftClass(a) {
    return features.aircraftVisualClass(a);
  }
  function displayTrack(a) {
    const reported=Number.isFinite(a.track) ? ((a.track%360)+360)%360 : null;
    const trail=state.trails.get(a.hex);
    if (!trail?.length || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return reported || 0;
    const now=trail.at(-1)?.[2] || 0;
    let anchor=null;
    for(let index=trail.length-1;index>=0;index-=1) {
      const point=trail[index];
      if(now-point[2]>120)break;
      if(features.haversine(point[0],point[1],a.lat,a.lon)>=.75){anchor=point;break;}
    }
    if(!anchor)return reported || 0;
    const movement=features.bearing(anchor[0],anchor[1],a.lat,a.lon);
    if(reported===null)return movement;
    const difference=Math.abs(((reported-movement+540)%360)-180);
    return difference>45 ? movement : reported;
  }
  function planeIcon(a) {
    const kind = aircraftClass(a);
    const size=visualSettings.aircraftSize;
    const rotation=displayTrack(a);
    return L.divIcon({
      className: `plane-marker plane-${kind}`,
      iconSize: [size,size], iconAnchor: [size/2,size/2],
      html: `<svg style="transform:rotate(${rotation}deg)" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="${iconPaths[kind]}"/></svg>`
    });
  }
  const haversine = features.haversine;
  const value = (v, suffix, decimals=0) => Number.isFinite(v) ? `${v.toFixed(decimals)} ${suffix}` : "—";

  async function aircraftMetadata(icao) {
    icao = icao.toUpperCase();
    if (state.db.has(icao)) return state.db.get(icao);
    const lookup = (async () => {
      let depth = 1;
      while (depth <= 6) {
        const block = icao.slice(0, depth), key = icao.slice(depth);
        const response = await fetch(`/diagnostics/db/${block}.json`);
        if (!response.ok) return {};
        const data = await response.json();
        if (data[key]) return data[key];
        if (!data.children || !data.children.includes(block + key.slice(0,1))) return {};
        depth += 1;
      }
      return {};
    })().catch(() => ({}));
    state.db.set(icao, lookup);
    return lookup;
  }
  async function typeMetadata(type) {
    if (!type) return {};
    if (!state.types) state.types = fetch("/diagnostics/db/aircraft_types/icao_aircraft_types.json")
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({}));
    const types = await state.types;
    const record = types[type.toUpperCase()] || {};
    return {typeDesc:record.desc, wakeCategory:record.wtc};
  }
  function airlineName(flight) {
    const code = airlineCode(flight);
    return code ? airlines[code] : undefined;
  }
  function airlineCode(flight) {
    const match = (flight || "").trim().toUpperCase().match(/^([A-Z]{3})[0-9A-Z]+$/);
    return match ? match[1] : undefined;
  }
  function trailColor(a) { return visualSettings.trailColorMode==="airline" ? airlineColors[airlineCode(a?.flight)] || visualSettings.aircraftColor : visualSettings.aircraftColor; }
  function markerOpacity(a) {
    const rssi=Number(a?.rssi);
    if(Number.isFinite(rssi) && rssi>=-23)return 1;
    if(Number.isFinite(rssi) && rssi>=-41)return .66;
    return .33;
  }
  async function enrichAircraft(hex) {
    const metadata = await aircraftMetadata(hex);
    const type = await typeMetadata(metadata.t);
    const aircraft = state.aircraft.get(hex);
    if (!aircraft) return;
    Object.assign(aircraft, metadata, type);
    const marker = state.markers.get(hex);
    const kind = aircraftClass(aircraft);
    if (marker && marker._aircraftKind !== kind) {
      marker.setIcon(planeIcon(aircraft));
      marker._aircraftKind = kind;
    }
    if (state.selected === hex) renderDetails();
  }
  function selectAircraft(hex) {
    performanceSamples.selectionStarted=performance.now();
    state.selected = hex;
    renderDetails();
    enrichAircraft(hex);
    const aircraft=state.aircraft.get(hex),key=routeKey(aircraft?.flight);
    if(!state.aircraftInfo.has(hex))state.aircraftInfo.set(hex,{loading:true});
    if(key&&!state.routes.has(key))state.routes.set(key,{loading:true});
    if(key&&state.routes.get(key)?.resolved){performanceSamples.selectionLatency.push(0);delete performanceSamples.selectionStarted;}
    refreshEnrichmentCache(true,true);
  }
  function routeKey(flight) { return (flight || "").trim().toUpperCase(); }
  function airportLabel(airport) {
    if (!airport) return "Trasa niedostępna";
    const code = airport.iata || airport.icao;
    return [airport.city || airport.name, code].filter(Boolean).join(" · ");
  }
  function showAirport(target,airport) {
    $(target).textContent=airportLabel(airport);
    const flag=$(`${target}-flag`),country=(airport?.country||"").toLowerCase();
    const valid=/^[a-z]{2}$/.test(country);
    flag.classList.toggle("hidden",!valid);
    flag.style.backgroundImage=valid?`url("/flags/${country}.svg")`:"";
    flag.setAttribute("aria-label",valid?country.toUpperCase():"");
  }
  let enrichmentInFlight=false,enrichmentPending=false,enrichmentRetryTimer;
  async function refreshEnrichmentCache(force=false,priority=false) {
    if(!force&&Date.now()-state.enrichmentLookupAt<5000)return;
    if(enrichmentInFlight){performanceSamples.counters.enrichmentCoalesced+=1;enrichmentPending=enrichmentPending||force;return;}
    state.enrichmentLookupAt=Date.now();
    const bounds=map.getBounds(),visible=[...state.aircraft.values()].filter(a=>bounds.contains([a.lat,a.lon])).slice(0,64);
    if(!visible.length)return;
    const items=visible.map(a=>`${a.hex}:${routeKey(a.flight)}`).join(",");
    const selected=priority&&state.selected?state.aircraft.get(state.selected):null;
    const priorityItem=selected?`&priority=${encodeURIComponent(`${selected.hex}:${routeKey(selected.flight)}`)}`:"";
    const started=performance.now(); enrichmentInFlight=true;
    try {
      const response=await fetch(`/api/enrichment.py?items=${encodeURIComponent(items)}${priorityItem}`,{cache:"no-store"});
      const data=await response.json(); if(!response.ok)return;
      for(const item of data.aircraft||[]) {
        const hex=item.hex.toLowerCase(),callsign=item.callsign;
        if(item.aircraft_cached)state.aircraftInfo.set(hex,{info:item.aircraft,resolved:true});
        if(callsign&&item.route_cached){state.routes.set(callsign,{route:item.route,resolved:true,stale:item.route_stale});if(selected&&callsign===routeKey(selected.flight)&&performanceSamples.selectionStarted){performanceSamples.selectionLatency.push(Math.round(performance.now()-performanceSamples.selectionStarted));if(performanceSamples.selectionLatency.length>60)performanceSamples.selectionLatency.shift();delete performanceSamples.selectionStarted;}}
      }
      renderDetails();
      const selectedRoute=selected&&state.routes.get(routeKey(selected.flight));
      if(selected&&!selectedRoute?.resolved){clearTimeout(enrichmentRetryTimer);enrichmentRetryTimer=setTimeout(()=>refreshEnrichmentCache(true,true),750);}
    } catch(_) {}
    finally {
      enrichmentInFlight=false; recordPerformance("enrichment",started);
      if(enrichmentPending){enrichmentPending=false;queueMicrotask(()=>refreshEnrichmentCache(true));}
    }
  }
  function renderDetails() {
    const a = state.aircraft.get(state.selected);
    $("details").classList.toggle("hidden", !a);
    if(renderDetails.selected&&renderDetails.selected!==state.selected)state.markers.get(renderDetails.selected)?.getElement()?.classList.remove("selected");
    renderDetails.selected=state.selected;
    if (!a) return;
    state.markers.get(a.hex)?.getElement()?.classList.add("selected");
    $("d-silhouette-path").setAttribute("d", iconPaths[aircraftClass(a)]);
    $("d-flight").textContent = (a.flight || "Nieznany lot").trim();
    $("d-registration").textContent = [a.r, a.t].filter(Boolean).join(" · ");
    $("d-airline").textContent = airlineName(a.flight) || "Nieznana / lot prywatny";
    const aircraftInfo = state.aircraftInfo.get(a.hex);
    $("d-model").textContent = aircraftInfo?.loading ? "Sprawdzanie…" : [aircraftInfo?.info?.manufacturer, aircraftInfo?.info?.model].filter(Boolean).join(" · ") || a.t || "Nieznany";
    $("d-capacity").textContent = passengerCapacity[a.t] ? `${passengerCapacity[a.t]} (zależnie od układu)` : "Brak wiarygodnych danych";
    const route = state.routes.get(routeKey(a.flight));
    if (route?.loading) {
      $("d-origin").textContent = "Sprawdzanie…";
      $("d-destination").textContent = "Sprawdzanie…";
      $("d-origin-flag").classList.add("hidden");
      $("d-destination-flag").classList.add("hidden");
    } else if (route?.route) {
      showAirport("d-origin",route.route.origin);
      showAirport("d-destination",route.route.destination);
    } else {
      $("d-origin").textContent = "Brak publicznej trasy";
      $("d-destination").textContent = routeKey(a.flight) ? `Kod ATC · ${routeKey(a.flight)}` : "Brak kodu lotu";
      $("d-origin-flag").classList.add("hidden");
      $("d-destination-flag").classList.add("hidden");
    }
    $("d-alt").textContent = value(typeof a.alt_baro === "number" ? a.alt_baro * .3048 : NaN, "m");
    $("d-speed").textContent = value(typeof a.gs === "number" ? a.gs * 1.852 : NaN, "km/h");
    $("d-distance").textContent = value(haversine(cfg.receiver.lat,cfg.receiver.lon,a.lat,a.lon), "km", 1);
    $("d-track").textContent = value(a.track, "°");
    $("d-rate").textContent = value(typeof a.baro_rate === "number" ? a.baro_rate * .3048 : NaN, "m/min");
    const rate = typeof a.baro_rate === "number" ? a.baro_rate : 0;
    const trend = rate > 100 ? ["climb","↑","Wznosi się"] : rate < -100 ? ["descend","↓","Opada"] : ["level","→","Stabilnie"];
    $("altitude-trend").className = `altitude-trend ${trend[0]}`;
    $("d-trend-arrow").textContent = trend[1];
    $("d-trend-label").textContent = trend[2];
    $("d-squawk").textContent = a.squawk || "—";
    $("d-signal").textContent = value(a.rssi, "dB", 1);
    const signalBars = Number.isFinite(a.rssi) ? Math.max(1, Math.min(5, Math.ceil((a.rssi + 50) / 9))) : 0;
    $("signal-bars").querySelectorAll("i").forEach((bar, index) => bar.classList.toggle("active", index < signalBars));
    $("d-seen").textContent = value(a.seen, "s", 1);
    $("d-icao").textContent = `ICAO: ${a.hex.toUpperCase()}`;
    const badges=features.badges(a),badgeKey=JSON.stringify(badges);
    if($("detail-badges").dataset.key!==badgeKey){$("detail-badges").dataset.key=badgeKey;$("detail-badges").replaceChildren(...badges.map(([label,kind]) => { const item=document.createElement("span"); item.className=`badge ${kind}`; item.textContent=label; return item; }));}
    $("details").classList.toggle("emergency",features.emergency(a));
    const look=features.look(cfg.receiver,a,state.mlatConfig?.terrain_m,state.mlatConfig?.antenna_height_m);
    $("d-bearing").textContent=look?`${Math.round(look.bearing)}°`:"—";
    $("d-direction").textContent=look?`${look.cardinal} · ${Math.round(look.bearing)}°`:"—";
    $("d-elevation").textContent=look&&Number.isFinite(look.elevation)?`Przybliżony kąt wzniesienia: ${Math.max(-5,look.elevation).toFixed(1)}°`:"Przybliżony kąt wzniesienia: —";
    $("look-compass").style.transform=look?`rotate(${look.bearing}deg)`:"";
    $("d-bearing").style.transform=look?`rotate(${-look.bearing}deg)`:"";
    renderAdvanced(a);
    translateUi($("details"));
  }
  function renderAdvanced(a) {
    const fields=[
      ["IAS",a.ias,"kt"],["TAS",a.tas,"kt"],["Mach",a.mach,"",2],
      ["Wysokość wybrana",a.nav_altitude_mcp ?? a.nav_altitude_fms,"ft"],["Wysokość bieżąca",a.alt_baro,"ft"],
      ["Kurs wybrany",a.nav_heading,"°"],["Kierunek lotu",a.track,"°"],
      ["Wys. barometryczna",a.alt_baro,"ft"],["Wys. geometryczna",a.alt_geom,"ft"],
      ["QNH",a.nav_qnh,"hPa",1],["Przechylenie",a.roll,"°",1],["Kategoria wake",a.wakeCategory,""],
      ["Dokładność nawigacji",a.nic_baro ?? a.nic,"NIC"]
    ].filter(([,v]) => v!==undefined && v!==null && v!=="ground" && v!=="");
    const fieldKey=JSON.stringify(fields);
    if($("advanced-grid").dataset.key!==fieldKey){$("advanced-grid").dataset.key=fieldKey;$("advanced-grid").replaceChildren(...fields.map(([label,v,unit,decimals=0]) => { const box=document.createElement("div"),span=document.createElement("span"),strong=document.createElement("strong"); span.textContent=label; strong.textContent=typeof v==="number"?`${v.toFixed(decimals)}${unit?` ${unit}`:""}`:`${v}${unit?` ${unit}`:""}`; box.append(span,strong); return box; }));}
    $("advanced").classList.toggle("hidden",fields.length===0);
  }
  let trailsRenderedAt=0;
  function updateTrails(now,force=false) {
    const started=performance.now();
    const cutoff = now - cfg.trailMinutes * 60;
    for (const a of state.aircraft.values()) {
      const trail = state.trails.get(a.hex) || [];
      const last = trail.at(-1);
      if (!last || Math.abs(last[0]-a.lat) > .0001 || Math.abs(last[1]-a.lon) > .0001) trail.push([a.lat,a.lon,now]);
      state.trails.set(a.hex, trail);
      state.trailColors.set(a.hex, trailColor(a));
    }
    if(!force&&now-trailsRenderedAt<2)return;
    trailsRenderedAt=now;
    // Keep every age band visibly connected to the next. Very faint old bands
    // made the darker sections on either side look like unrelated orphan lines.
    const opacity = [.32,.40,.48,.60,.72];
    for (const [hex, trail] of state.trails) {
      while (trail.length && trail[0][2] < cutoff) trail.shift();
      let lines = state.lines.get(hex) || [];
      if(!trail.length) {
        lines.forEach((line)=>line.remove());
        state.lines.delete(hex); state.trails.delete(hex); state.trailColors.delete(hex);
        continue;
      }
      const aircraft=state.aircraft.get(hex);
      const point=aircraft ? map.latLngToContainerPoint([aircraft.lat,aircraft.lon]) : null;
      const mapSize=map.getSize(),iconMargin=visualSettings.aircraftSize*.65;
      const aircraftFullyVisible=point && point.x>=iconMargin && point.x<=mapSize.x-iconMargin && point.y>=64+iconMargin && point.y<=mapSize.y-iconMargin;
      if(!aircraftFullyVisible) {
        lines.forEach((line)=>line.setLatLngs([]));
        continue;
      }
      while (lines.length < opacity.length) lines.push(L.polyline([], {color:visualSettings.aircraftColor,weight:visualSettings.trailWidth,interactive:false}).addTo(map));
      const bands = opacity.map(() => []);
      for (let i = 1; i < trail.length; i += 1) {
        const age = Math.max(0, Math.min(1, (trail[i][2] - cutoff) / (cfg.trailMinutes * 60)));
        const band = Math.min(opacity.length - 1, Math.floor(age * opacity.length));
        if (!bands[band].length) bands[band].push([trail[i-1][0],trail[i-1][1]]);
        bands[band].push([trail[i][0],trail[i][1]]);
      }
      const color = state.trailColors.get(hex) || visualSettings.aircraftColor;
      lines.forEach((line, i) => { line.setLatLngs(bands[i]); line.setStyle({opacity:opacity[i],color,weight:visualSettings.trailWidth}); });
      state.lines.set(hex, lines);
    }
    recordPerformance("trails",started);
  }
  function removeAircraftVisuals(hex) {
    state.markers.get(hex)?.remove();
    for(const line of state.lines.get(hex) || []) line.remove();
    state.markers.delete(hex);
    state.lines.delete(hex);
    state.trails.delete(hex);
    state.trailColors.delete(hex);
  }
  let refreshInFlight=false,refreshTimer;
  async function refresh() {
    if(refreshInFlight){performanceSamples.counters.refreshCoalesced+=1;return;}
    if(mapBusy||dialogOpen()){refreshTimer=setTimeout(refresh,250);return;}
    refreshInFlight=true;
    const started=performance.now();
    try {
      const response = await fetch(`/data/aircraft.json?t=${Date.now()}`, {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.daily=features.updateDaily(state.daily,data.aircraft||[],cfg.receiver,new Date(),cfg.staleSeconds);
      features.checkpoint(state.daily,localStorage);
      if (state.mlatConfig?.enabled && Date.now()-state.nearbyLookupAt>=5000) lookupNearbyHelicopters();
      const nowMs=Date.now();
      const combinedByHex=new Map();
      for(const cached of state.nearbyHelicopters.values()) {
        const positionAge=(cached.seen_pos??0)+(nowMs-cached.updated)/1000;
        if(positionAge<=cfg.staleSeconds) combinedByHex.set(cached.hex,{...cached,seen_pos:positionAge,onlineOnly:true,onlinePosition:true});
      }
      for(const local of data.aircraft||[]) {
        const cached=combinedByHex.get(local.hex);
        const localHasPosition=Number.isFinite(local.lat)&&Number.isFinite(local.lon)&&(local.seen_pos??999)<=cfg.staleSeconds;
        if(cached&&!localHasPosition) combinedByHex.set(local.hex,{...cached,...local,lat:cached.lat,lon:cached.lon,seen_pos:cached.seen_pos,mlat:cached.mlat,onlineOnly:false,onlinePosition:true});
        else combinedByHex.set(local.hex,{...cached,...local,onlineOnly:false});
      }
      const combined=[...combinedByHex.values()];
      const positioned = new Map();
      const unpositioned=[];
      for (const a of combined) {
        if ((!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||(a.seen_pos??999)>cfg.staleSeconds) && (a.seen??999)<=cfg.staleSeconds) {
          const fallback=state.remotePositions.get(a.hex);
          const fallbackAge=fallback?(fallback.seen_pos??0)+(nowMs-fallback.updated)/1000:Infinity;
          if (fallback && fallbackAge<=cfg.staleSeconds) Object.assign(a,{lat:fallback.lat,lon:fallback.lon,seen_pos:fallbackAge,mlat:fallback.mlat,onlinePosition:true});
          else unpositioned.push(a.hex);
        }
        if (Number.isFinite(a.lat) && Number.isFinite(a.lon) && (a.seen_pos ?? 999) <= cfg.staleSeconds) {
          const previous = state.aircraft.get(a.hex);
          if (previous) Object.assign(a, {r:previous.r,t:previous.t,typeDesc:previous.typeDesc,wakeCategory:previous.wakeCategory,dbFlags:previous.dbFlags});
          positioned.set(a.hex, a);
        }
      }
      if (unpositioned.length && Date.now()-state.positionLookupAt>=5000) lookupOnlinePositions(unpositioned);
      state.unpositionedCount=unpositioned.length;
      state.aircraft = positioned;
      refreshEnrichmentCache();
      const visualHexes=new Set([...state.markers.keys(),...state.lines.keys(),...state.trails.keys()]);
      for(const hex of visualHexes) if(!positioned.has(hex)) removeAircraftVisuals(hex);
      for (const a of positioned.values()) {
        let marker = state.markers.get(a.hex);
        if (!marker) {
          marker = L.marker([a.lat,a.lon], {icon:planeIcon(a), keyboard:false}).addTo(map);
          marker._aircraftKind = aircraftClass(a);
          marker._lat=a.lat;marker._lon=a.lon;marker._rotation=displayTrack(a);marker._opacity=markerOpacity(a);
          marker.on("click", () => selectAircraft(a.hex));
          state.markers.set(a.hex, marker);
          enrichAircraft(a.hex);
        } else {
          if(marker._lat!==a.lat||marker._lon!==a.lon){marker.setLatLng([a.lat,a.lon]);marker._lat=a.lat;marker._lon=a.lon;}
          const svg = marker.getElement()?.querySelector("svg");
          const rotation=displayTrack(a);if(svg&&marker._rotation!==rotation){svg.style.transform=`rotate(${rotation}deg)`;marker._rotation=rotation;}
        }
        const opacity=markerOpacity(a);if(marker._opacity!==opacity){marker.setOpacity(opacity);marker._opacity=opacity;}
      }
      $("aircraft-count").textContent = positioned.size;
      $("empty-state").classList.toggle("hidden", positioned.size > 0);
      $("empty-state").textContent = "Czekam na samoloty w zasięgu anteny…";
      $("health").className = "status-button adb-button ok";
      $("health").setAttribute("aria-label", "Odbiornik ADB działa");
      updateTrails(data.now || Date.now()/1000);
      renderDetails();
      translateUi(document.querySelector(".topbar"));
    } catch (error) {
      $("health").className = "status-button adb-button error";
      $("health").setAttribute("aria-label", "Brak danych z odbiornika ADB");
      $("empty-state").classList.remove("hidden");
      $("empty-state").textContent = "Odbiornik ADS-B jest odłączony lub jeszcze się uruchamia.";
    } finally {
      refreshInFlight=false;recordPerformance("refresh",started);
      clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,Math.max(0,1000-(performance.now()-started)));
    }
  }
  async function lookupOnlinePositions(hexes) {
    state.positionLookupAt=Date.now();
    try { const response=await fetch(`/api/position.py?hex=${encodeURIComponent(hexes.slice(0,16).join(","))}`,{cache:"no-store"}); const data=await response.json(); if(!response.ok)return; const now=Date.now(); for(const aircraft of data.aircraft||[])state.remotePositions.set(aircraft.hex,{...aircraft,updated:now}); } catch(_) {}
  }
  async function lookupNearbyHelicopters(){ state.nearbyLookupAt=Date.now(); try{const response=await fetch("/api/position.py?nearby=helicopters",{cache:"no-store"});const data=await response.json();if(!response.ok)return;const now=Date.now();for(const aircraft of data.aircraft||[])state.nearbyHelicopters.set(aircraft.hex,{...aircraft,updated:now});}catch(_){} }
  $("close-details").addEventListener("click", () => { state.selected = null; renderDetails(); });
  map.on("click", () => { state.selected = null; renderDetails(); });
  const wifi = {secure:true, shift:false};
  const wifiRequest = async (action, options={}) => {
    const response = await fetch(`/api/wifi.py?action=${action}`, {cache:"no-store", ...options});
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const mlatRequest = async (action, options={}) => {
    const response=await fetch(`/api/mlat.py?action=${action}`,{cache:"no-store",...options});
    const data=await response.json(); if(!response.ok||data.error) throw new Error(data.error||`HTTP ${response.status}`); return data;
  };
  const mlatLabels={disabled:"wyłączony",waiting_wifi:"oczekuje na Wi‑Fi",connecting:"oczekuje",synchronized:"zsynchronizowany",error:"błąd"};
  function mlatAge(timestamp) {
    if(!timestamp)return "—";
    const seconds=Math.max(0,Math.round(Date.now()/1000-timestamp));
    if(seconds<5)return "teraz";
    if(seconds<60)return `${seconds} s temu`;
    if(seconds<3600)return `${Math.floor(seconds/60)} min temu`;
    return `${Math.floor(seconds/3600)} godz. temu`;
  }
  let mlatStatusPromise=null,wifiStatusPromise=null;
  function updateMlatStatus() {
    if(mlatStatusPromise){performanceSamples.counters.mlatCoalesced+=1;return mlatStatusPromise;}
    mlatStatusPromise=(async()=>{try {
      const data=await mlatRequest("status"); state.mlatConfig=data.config||null;
      applyReceiverLocation(data.config);
      const label=mlatLabels[data.state]||data.state;
      $("mlat-button").className=`status-button mlat-button ${data.state}`;
      $("mlat-button").setAttribute("aria-label",`Stan MLAT: ${label}`);
      $("mlat-state-value").textContent=data.state==="synchronized"?"Zsynchronizowany":data.connected?"Połączony, czeka":label;
      $("mlat-altitude-value").textContent=Number.isFinite(data.config?.ellipsoid_altitude_m)?`${data.config.ellipsoid_altitude_m.toFixed(0)} m`:"—";
      $("mlat-connection-age").textContent=data.connected_since?mlatAge(data.connected_since).replace(" temu",""):"—";
      $("mlat-last-sync").textContent=mlatAge(data.last_sync_at);
      $("mlat-issue").className=`mlat-issue ${data.state}`;
      if(data.state==="synchronized")$("mlat-issue").textContent="MLAT działa prawidłowo.";
      else if(data.state==="connecting")$("mlat-issue").textContent=Date.now()/1000-(data.connected_since||Date.now()/1000)>600?"Brak synchronizacji od ponad 10 minut.":"Zbieranie danych do synchronizacji…";
      else if(data.state==="waiting_wifi")$("mlat-issue").textContent="Brak Wi‑Fi — MLAT czeka na połączenie.";
      else if(data.state==="disabled")$("mlat-issue").textContent="MLAT jest wyłączony.";
      else $("mlat-issue").textContent=data.detail||"Nie można połączyć z usługą MLAT.";
    } catch(error) {
      $("mlat-state-value").textContent="Błąd"; $("mlat-issue").textContent=error.message;
      $("mlat-button").className="status-button mlat-button error";
      $("mlat-button").setAttribute("aria-label","Stan MLAT: błąd");
    } finally {translateUi($("mlat-dialog"));translateUi(document.querySelector(".topbar"));}})().finally(()=>{mlatStatusPromise=null;});
    return mlatStatusPromise;
  }
  function updateWifiStatus() {
    if(wifiStatusPromise){performanceSamples.counters.wifiCoalesced+=1;return wifiStatusPromise;}
    wifiStatusPromise=(async()=>{try {
      const status = await wifiRequest("status");
      const strength = status.signal >= 67 ? 3 : status.signal >= 34 ? 2 : 1;
      $("wifi-button").className = `wifi-button ${status.connected ? `online strength-${strength}` : "offline"}`;
      $("wifi-button").setAttribute("aria-label", status.connected ? `Ustawienia Wi-Fi, połączono, siła sygnału ${status.signal ?? "nieznana"}%` : "Ustawienia Wi-Fi, brak połączenia");
    } catch (_) {
      $("wifi-button").className = "wifi-button offline";
      $("wifi-button").setAttribute("aria-label", "Ustawienia Wi-Fi, niedostępne");
    } finally {translateUi($("wifi-dialog"));translateUi(document.querySelector(".topbar"));}})().finally(()=>{wifiStatusPromise=null;});
    return wifiStatusPromise;
  }
  async function scanWifi() {
    $("wifi-form").classList.add("hidden");
    $("wifi-networks").classList.remove("hidden");
    $("wifi-message").textContent = "Wyszukiwanie dostępnych sieci…";
    $("wifi-networks").replaceChildren();
    try {
      const status = await wifiRequest("status");
      $("wifi-disconnect").classList.toggle("hidden", !status.connected);
      if (status.connected) $("wifi-disconnect").textContent = `Rozłącz ${status.ssid}`;
      const data = await wifiRequest("scan");
      $("wifi-message").textContent = data.networks.length ? "Dotknij sieci, aby się połączyć:" : "Nie znaleziono sieci Wi‑Fi.";
      for (const network of data.networks) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "network-button";
        button.innerHTML = `<strong></strong><small>${network.secure ? "🔒 " : ""}${network.signal}%</small>`;
        button.querySelector("strong").textContent = network.ssid;
        button.addEventListener("click", () => chooseWifi(network));
        $("wifi-networks").append(button);
      }
    } catch (error) { $("wifi-message").textContent = `Błąd: ${error.message}`; }
    finally {translateUi($("wifi-dialog"));}
  }
  function chooseWifi(network) {
    wifi.secure = network.secure;
    $("wifi-ssid").value = network.ssid;
    $("wifi-password").value = "";
    $("wifi-password-label").classList.toggle("hidden", !network.secure);
    $("wifi-keyboard").classList.toggle("hidden", !network.secure);
    $("wifi-networks").classList.add("hidden");
    $("wifi-form").classList.remove("hidden");
    $("wifi-message").textContent = network.secure ? "Wpisz hasło do sieci." : "Ta sieć nie wymaga hasła.";
    translateUi($("wifi-dialog"));
  }
  function renderKeyboard() {
    const rows = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", "-_=+@#$%&!?."];
    $("wifi-keyboard").replaceChildren(...rows.map((keys, rowIndex) => {
      const row = document.createElement("div"); row.className = "keyboard-row";
      if (rowIndex === 3) addKey(row, "⇧", "shift", true);
      for (const key of keys) addKey(row, wifi.shift ? key.toUpperCase() : key, "char");
      if (rowIndex === 3) addKey(row, "⌫", "backspace", true);
      return row;
    }));
  }
  function addKey(row, label, action, wide=false) {
    const key = document.createElement("button"); key.type = "button"; key.textContent = label;
    if (wide) key.className = "key-wide";
    key.addEventListener("click", () => {
      const input = $("wifi-password");
      if (action === "backspace") input.value = input.value.slice(0,-1);
      else if (action === "shift") { wifi.shift = !wifi.shift; renderKeyboard(); }
      else input.value += label;
    });
    row.append(key);
  }
  $("wifi-button").addEventListener("click", () => { $("wifi-dialog").classList.remove("hidden"); scanWifi(); });
  function populateReceiverForm(config) {
    state.savedReceiver={lat:config.receiver_lat,lon:config.receiver_lon,ellipsoid_altitude_m:config.ellipsoid_altitude_m};
    $("receiver-lat").value=state.savedReceiver.lat;
    $("receiver-lon").value=state.savedReceiver.lon;
    $("receiver-altitude").value=state.savedReceiver.ellipsoid_altitude_m;
    $("receiver-location-message").textContent="Zmiany zaczną działać dopiero po zatwierdzeniu.";
  }
  const receiverDefaults={lat:53.3811,lon:-1.4701,ellipsoid_altitude_m:190};
  const receiverFieldRules={
    "receiver-lat":{min:-90,max:90},
    "receiver-lon":{min:-180,max:180},
    "receiver-altitude":{min:-500,max:10000}
  };
  let activeReceiverInput=null,receiverNumberBuffer="";
  function closeReceiverNumpad(){
    $("receiver-numpad").classList.add("hidden");
    activeReceiverInput=null;
  }
  function showReceiverNumpad(input){
    activeReceiverInput=input; receiverNumberBuffer=input.value;
    $("receiver-numpad-title").textContent=input.parentElement.childNodes[0].nodeValue.trim();
    $("receiver-numpad-value").textContent=receiverNumberBuffer || "0";
    $("receiver-numpad-error").textContent="";
    $("receiver-numpad").classList.remove("hidden");
  }
  for(const input of document.querySelectorAll(".receiver-number")) input.addEventListener("click",()=>showReceiverNumpad(input));
  $("receiver-numpad").addEventListener("click",(event)=>{
    const button=event.target.closest("button"); if(!button||!activeReceiverInput)return;
    const key=button.dataset.numberKey,action=button.dataset.numberAction;
    if(key!==undefined) receiverNumberBuffer=receiverNumberBuffer==="0"?key:receiverNumberBuffer+key;
    else if(action==="minus") receiverNumberBuffer=receiverNumberBuffer.startsWith("-")?receiverNumberBuffer.slice(1):`-${receiverNumberBuffer}`;
    else if(action==="decimal"&&!receiverNumberBuffer.includes(".")) receiverNumberBuffer+=receiverNumberBuffer?".":"0.";
    else if(action==="clear") receiverNumberBuffer="";
    else if(action==="backspace") receiverNumberBuffer=receiverNumberBuffer.slice(0,-1);
    else if(action==="cancel") { closeReceiverNumpad(); return; }
    else if(action==="confirm") {
      const value=Number(receiverNumberBuffer),rule=receiverFieldRules[activeReceiverInput.id];
      if(!receiverNumberBuffer||!Number.isFinite(value)||value<rule.min||value>rule.max) { $("receiver-numpad-error").textContent="Wartość jest poza dozwolonym zakresem."; return; }
      activeReceiverInput.value=receiverNumberBuffer; closeReceiverNumpad(); return;
    }
    $("receiver-numpad-error").textContent="";
    $("receiver-numpad-value").textContent=receiverNumberBuffer || "0";
  });
  async function loadReceiverForm() {
    try { const data=await mlatRequest("status"); populateReceiverForm(data.config); }
    catch(error) { $("receiver-location-message").textContent=`Błąd: ${error.message}`; }
  }
  $("test-button").addEventListener("click", () => { renderIconDiagnostics(); loadReceiverForm(); $("test-dialog").classList.remove("hidden"); });
  $("test-close").addEventListener("click", () => {closeReceiverNumpad();$("test-dialog").classList.add("hidden");});
  $("receiver-location-cancel").addEventListener("click",()=>{if(state.savedReceiver)populateReceiverForm({receiver_lat:state.savedReceiver.lat,receiver_lon:state.savedReceiver.lon,ellipsoid_altitude_m:state.savedReceiver.ellipsoid_altitude_m});});
  $("receiver-location-reset").addEventListener("click",()=>{
    $("receiver-lat").value=receiverDefaults.lat; $("receiver-lon").value=receiverDefaults.lon; $("receiver-altitude").value=receiverDefaults.ellipsoid_altitude_m;
    $("receiver-location-message").textContent="Przywrócono wartości domyślne. Dotknij Zmień, aby zapisać.";
  });
  $("receiver-location-form").addEventListener("submit",async(event)=>{
    event.preventDefault();
    const body={lat:Number($("receiver-lat").value),lon:Number($("receiver-lon").value),ellipsoid_altitude_m:Number($("receiver-altitude").value)};
    if(!Number.isFinite(body.lat)||body.lat < -90||body.lat > 90||!Number.isFinite(body.lon)||body.lon < -180||body.lon > 180||!Number.isFinite(body.ellipsoid_altitude_m)||body.ellipsoid_altitude_m < -500||body.ellipsoid_altitude_m > 10000) { $("receiver-location-message").textContent="Wartość jest poza dozwolonym zakresem."; return; }
    $("receiver-location-message").textContent="Zapisywanie…";
    try {
      const result=await mlatRequest("location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      populateReceiverForm(result.config); applyReceiverLocation(result.config,true); await updateMlatStatus();
      $("receiver-location-message").textContent="Zapisano. MLAT uruchamia się z nową lokalizacją.";
    } catch(error) { $("receiver-location-message").textContent=`Nie zapisano: ${error.message}`; }
  });
  $("mlat-button").addEventListener("click", () => { $("mlat-dialog").classList.remove("hidden"); updateMlatStatus(); });
  $("mlat-close").addEventListener("click", () => $("mlat-dialog").classList.add("hidden"));
  $("wifi-close").addEventListener("click", () => $("wifi-dialog").classList.add("hidden"));
  $("wifi-back").addEventListener("click", scanWifi);
  $("wifi-disconnect").addEventListener("click", async () => {
    $("wifi-message").textContent = "Rozłączanie…";
    try {
      await wifiRequest("disconnect", {method:"POST"});
      $("wifi-disconnect").classList.add("hidden");
      $("wifi-message").textContent = "Wi‑Fi rozłączone. Możesz połączyć się ponownie z zapisanej sieci.";
      await updateWifiStatus();
    } catch (error) { $("wifi-message").textContent = `Nie udało się rozłączyć: ${error.message}`; }
  });
  $("wifi-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("wifi-message").textContent = "Łączenie…";
    try {
      const result = await wifiRequest("connect", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ssid:$("wifi-ssid").value,password:wifi.secure ? $("wifi-password").value : ""})});
      $("wifi-message").textContent = result.connected ? `Połączono z ${result.ssid}.` : "Zapisano sieć. Trwa nawiązywanie połączenia…";
      setTimeout(updateWifiStatus, 2500);
    } catch (error) { $("wifi-message").textContent = `Nie udało się połączyć: ${error.message}`; }
  });
  function summaryName(item){ return item?(item.flight||item.hex.toUpperCase()):""; }
  function renderSummary(){ const s=state.daily; const mlatCount=Object.keys(s.mlat||{}).length,mlatNeeded=Object.keys(s.needsMlat||{}).length; $("summary-date").textContent=new Intl.DateTimeFormat(window.MamalotyI18n.locale,{dateStyle:"long"}).format(new Date()); $("s-seen").textContent=Object.keys(s.seen).length; $("s-current").textContent=state.aircraft.size; $("s-mlat-percent").textContent=mlatNeeded?`${Math.round(mlatCount/mlatNeeded*100)}%`:"—"; $("s-mlat").textContent=`${mlatCount} z ${mlatNeeded} · teraz bez pozycji: ${state.unpositionedCount}`; $("s-furthest").textContent=s.furthest?`${s.furthest.value.toFixed(1)} km`:"—"; $("s-highest").textContent=s.highest?`${Math.round(s.highest.value*.3048)} m`:"—"; $("s-strongest").textContent=s.strongest?`${s.strongest.value.toFixed(1)} dB`:"—"; $("s-furthest-name").textContent=summaryName(s.furthest); $("s-highest-name").textContent=summaryName(s.highest); $("s-strongest-name").textContent=summaryName(s.strongest);translateUi($("summary-dialog")); }
  $("summary-button").addEventListener("click",()=>{renderSummary();$("summary-dialog").classList.remove("hidden");});
  $("summary-close").addEventListener("click",()=>$("summary-dialog").classList.add("hidden"));
  function applyVisualSettings(save=true) {
    visualSettings.aircraftColor=document.querySelector("[data-aircraft-color].active")?.dataset.aircraftColor || visualDefaults.aircraftColor;
    visualSettings.trailWidth=Number($("trail-width").value);
    visualSettings.trailColorMode=document.querySelector("[data-trail-color].active")?.dataset.trailColor || "airline";
    visualSettings.aircraftSize=Number($("aircraft-size").value);
    visualSettings.startupZoom=Number($("startup-zoom").value);
    document.documentElement.style.setProperty("--aircraft-color",visualSettings.aircraftColor);
    $("trail-width-value").textContent=`${visualSettings.trailWidth} px`;
    $("aircraft-size-value").textContent=`${visualSettings.aircraftSize} px`;
    $("startup-zoom-value").textContent=String(visualSettings.startupZoom);
    if(map.getZoom()!==visualSettings.startupZoom)map.setZoom(visualSettings.startupZoom);
    for(const [hex,marker] of state.markers) marker.setIcon(planeIcon(state.aircraft.get(hex)));
    for(const a of state.aircraft.values()) state.trailColors.set(a.hex,trailColor(a));
    if(save){localStorage.setItem("mamaloty.visual-settings",JSON.stringify(visualSettings));localStorage.setItem("mamaloty.visual-settings-version",visualSettingsVersion);}
  }
  function populateVisualSettings() {
    for(const button of document.querySelectorAll("[data-aircraft-color]")) {
      const active=button.dataset.aircraftColor===visualSettings.aircraftColor;
      button.classList.toggle("active",active); button.setAttribute("aria-pressed",String(active));
    }
    $("trail-width").value=visualSettings.trailWidth;
    for(const button of document.querySelectorAll("[data-trail-color]")) {
      const active=button.dataset.trailColor===visualSettings.trailColorMode;
      button.classList.toggle("active",active); button.setAttribute("aria-pressed",String(active));
    }
    $("aircraft-size").value=visualSettings.aircraftSize;
    $("startup-zoom").value=visualSettings.startupZoom;
    applyVisualSettings(false);
  }
  let brightnessRequest=false,brightnessWanted=null,brightnessRevision=0;
  async function loadBrightness() {
    const revision=brightnessRevision;
    try {
      const response=await fetch("/api/brightness.py",{cache:"no-store"}),data=await response.json();
      if(!response.ok||revision!==brightnessRevision||brightnessWanted!==null)return;
      $("screen-brightness").value=data.percent;
      $("screen-brightness-value").textContent=`${data.percent}%`;
    } catch(_) {}
  }
  async function flushBrightness() {
    if(brightnessRequest||brightnessWanted===null)return;
    brightnessRequest=true;
    const percent=brightnessWanted;brightnessWanted=null;
    try {
      const response=await fetch("/api/brightness.py",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`percent=${percent}`,cache:"no-store"});
      const data=await response.json();
      if(response.ok&&brightnessWanted===null)$("screen-brightness-value").textContent=`${data.percent}%`;
    } catch(_) {}
    finally {brightnessRequest=false;if(brightnessWanted!==null)queueMicrotask(flushBrightness);}
  }
  function changeBrightness() {
    const percent=Number($("screen-brightness").value);brightnessRevision+=1;
    $("screen-brightness-value").textContent=`${percent}%`;
    brightnessWanted=percent;flushBrightness();
  }
  $("settings-button").addEventListener("click",()=>{$("settings-dialog").classList.remove("hidden");loadBrightness();});
  $("settings-close").addEventListener("click",()=>{$("settings-dialog").classList.add("hidden");flushBrightness();refresh();});
  for(const id of ["trail-width","aircraft-size","startup-zoom"]) $(id).addEventListener("input",()=>applyVisualSettings());
  $("screen-brightness").addEventListener("input",changeBrightness);
  for(const button of document.querySelectorAll("[data-aircraft-color]")) button.addEventListener("click",()=>{visualSettings.aircraftColor=button.dataset.aircraftColor;populateVisualSettings();applyVisualSettings();});
  for(const button of document.querySelectorAll("[data-trail-color]")) button.addEventListener("click",()=>{visualSettings.trailColorMode=button.dataset.trailColor;populateVisualSettings();applyVisualSettings();});
  for(const button of document.querySelectorAll(".range-step")) button.addEventListener("click",()=>{
    const input=$(button.dataset.range),step=Number(input.step)||1;
    input.value=Math.min(Number(input.max),Math.max(Number(input.min),Number(input.value)+Number(button.dataset.direction)*step));
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  $("settings-reset").addEventListener("click",()=>{visualSettings={...visualDefaults};populateVisualSettings();localStorage.removeItem("mamaloty.visual-settings");});
  addEventListener("beforeunload",()=>features.checkpoint(state.daily,localStorage,Date.now(),true));
  addEventListener("mamaloty-language-change",()=>{renderDetails();if(!$("summary-dialog").classList.contains("hidden"))renderSummary();translateUi(document.body);});
  populateVisualSettings();
  const pollWifiStatus=async()=>{if(!dialogOpen())await updateWifiStatus();setTimeout(pollWifiStatus,10000);};
  const pollMlatStatus=async()=>{if(!dialogOpen())await updateMlatStatus();setTimeout(pollMlatStatus,10000);};
  renderKeyboard(); pollWifiStatus(); pollMlatStatus();
  refresh();
})();
