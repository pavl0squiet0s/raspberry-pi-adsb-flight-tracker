(() => {
  "use strict";
  let language = localStorage.getItem("mamaloty.language") === "en" ? "en" : "pl";
  const textState=new WeakMap(),attributeState=new WeakMap();
  const translations = new Map(Object.entries({
    "Mapa samolotow":"Aircraft map","Ustawienia wyglądu":"Appearance settings","Diagnostyka ikon":"Icon diagnostics","Jasność ekranu":"Screen brightness",
    "Ustawienia MLAT":"MLAT settings","Odbiornik ADB uruchamia się":"ADB receiver is starting","Ustawienia Wi-Fi":"Wi-Fi settings",
    "Podsumowanie dnia":"Daily summary","Czekam na samoloty w zasięgu anteny…":"Waiting for aircraft within antenna range…",
    "Zamknij":"Close","Nieznany lot":"Unknown flight","GDZIE PATRZEĆ":"WHERE TO LOOK","Kąt wzniesienia: —":"Elevation angle: —",
    "SKĄD":"FROM","DOKĄD":"TO","LOT":"FLIGHT","Stabilnie":"Level","PRĘDKOŚĆ":"SPEED","KIERUNEK":"HEADING",
    "ODBIÓR":"RECEPTION","ODLEGŁOŚĆ":"DISTANCE","SYGNAŁ":"SIGNAL","MIEJSCA":"SEATS","Sygnał sprzed":"Signal age",
    "Więcej":"More","Dzisiaj":"Today","SAMOLOTY":"AIRCRAFT","TERAZ":"NOW","NAJDALEJ":"FURTHEST",
    "NAJWYŻEJ":"HIGHEST","NAJSILNIEJSZY SYGNAŁ":"STRONGEST SIGNAL","SKUTECZNOŚĆ MLAT":"MLAT SUCCESS",
    "Wygląd mapy":"Map appearance","Język":"Language","Kolor samolotów":"Aircraft colour","Grubość śladu":"Trail width",
    "Kolor śladu":"Trail colour","Kolor samolotu":"Aircraft colour","Kolor linii lotniczej":"Airline colour","Linie lotnicze":"Airlines","Samolot":"Aircraft",
    "Zmniejsz grubość śladu":"Decrease trail width","Zwiększ grubość śladu":"Increase trail width","Zmniejsz rozmiar ikon samolotów":"Decrease aircraft icon size","Zwiększ rozmiar ikon samolotów":"Increase aircraft icon size",
    "Niebieski":"Blue","Zielony":"Green","Pomarańczowy":"Orange","Ciemnoszary":"Dark grey","Początkowe przybliżenie":"Startup zoom level","Zmniejsz początkowe przybliżenie":"Decrease startup zoom level","Zwiększ początkowe przybliżenie":"Increase startup zoom level",
    "Wpisz wartość":"Enter value","Wyczyść":"Clear","Cofnij":"Backspace","Potwierdź":"Confirm","Wartość jest poza dozwolonym zakresem.":"Value is outside the permitted range.","Przywrócono wartości domyślne. Dotknij Zmień, aby zapisać.":"Default values restored. Tap Change to save.",
    "Rozmiar ikon samolotów":"Aircraft icon size","Przywróć domyślne":"Restore defaults","Test i konfiguracja":"Test and configuration",
    "Lokalizacja odbiornika":"Receiver location","Szerokość geograficzna":"Latitude","Długość geograficzna":"Longitude",
    "Wysokość WGS84 (m)":"WGS84 altitude (m)","Zmiany zaczną działać dopiero po zatwierdzeniu.":"Changes take effect after confirmation.",
    "Zmień":"Change","Anuluj":"Cancel","Połącz z Wi‑Fi":"Connect to Wi-Fi","Wyszukiwanie dostępnych sieci…":"Searching for available networks…",
    "Rozłącz Wi‑Fi":"Disconnect Wi-Fi","Sieć":"Network","Hasło":"Password","Połącz":"Connect","Wybierz inną sieć":"Choose another network",
    "Wyznacza pozycję samolotu z czasu odbioru sygnału przez kilka anten.":"Calculates aircraft position from signal arrival times at several antennas.",
    "STATUS":"STATUS","WYSOKOŚĆ WGS84":"WGS84 ALTITUDE","POŁĄCZENIE":"CONNECTION","OSTATNIA SYNCHRONIZACJA":"LAST SYNCHRONISATION",
    "Sprawdzanie…":"Checking…","Sprawdzanie stanu MLAT…":"Checking MLAT status…","Trasa niedostępna":"Route unavailable",
    "Nieznana / lot prywatny":"Unknown / private flight","Nieznany":"Unknown","Brak wiarygodnych danych":"No reliable data",
    "Brak publicznej trasy":"No public route","Brak kodu lotu":"No flight code","Wznosi się":"Climbing","Opada":"Descending",
    "Wysokość wybrana":"Selected altitude","Wysokość bieżąca":"Current altitude","Kurs wybrany":"Selected heading",
    "Kierunek lotu":"Track","Wys. barometryczna":"Barometric altitude","Wys. geometryczna":"Geometric altitude",
    "Przechylenie":"Roll","Kategoria wake":"Wake category","Dokładność nawigacji":"Navigation accuracy",
    "Odbiornik ADB działa":"ADB receiver is working","Brak danych z odbiornika ADB":"No data from ADB receiver",
    "Odbiornik ADS-B jest odłączony lub jeszcze się uruchamia.":"The ADS-B receiver is disconnected or still starting.",
    "wyłączony":"disabled","oczekuje na Wi‑Fi":"waiting for Wi-Fi","oczekuje":"connecting","zsynchronizowany":"synchronised","błąd":"error",
    "Zsynchronizowany":"Synchronised","Połączony, czeka":"Connected, waiting","MLAT działa prawidłowo.":"MLAT is working correctly.",
    "Brak synchronizacji od ponad 10 minut.":"No synchronisation for over 10 minutes.","Zbieranie danych do synchronizacji…":"Collecting data for synchronisation…",
    "Brak Wi‑Fi — MLAT czeka na połączenie.":"No Wi-Fi — MLAT is waiting for a connection.","MLAT jest wyłączony.":"MLAT is disabled.",
    "Nie można połączyć z usługą MLAT.":"Cannot connect to the MLAT service.","Błąd":"Error","Dotknij sieci, aby się połączyć:":"Tap a network to connect:",
    "Nie znaleziono sieci Wi‑Fi.":"No Wi-Fi networks found.","Wpisz hasło do sieci.":"Enter the network password.",
    "Ta sieć nie wymaga hasła.":"This network does not require a password.","Rozłączanie…":"Disconnecting…",
    "Wi‑Fi rozłączone. Możesz połączyć się ponownie z zapisanej sieci.":"Wi-Fi disconnected. You can reconnect to the saved network.",
    "Łączenie…":"Connecting…","Zapisywanie…":"Saving…","Zapisano. MLAT uruchamia się z nową lokalizacją.":"Saved. MLAT is starting with the new location.",
    "Helikopter":"Helicopter","Myśliwiec":"Fighter","Wojskowy / transportowy":"Military / transport","Lekki śmigłowy":"Light propeller",
    "Turbośmigłowy":"Turboprop","Odrzutowiec biznesowy":"Business jet","Odrzutowiec pasażerski":"Passenger jet","Szerokokadłubowy liniowiec":"Wide-body airliner","Superciężki":"Super-heavy",
    "Wirnikowce: R22/R44/R66, H135/H145, A109 i S-76.":"Rotorcraft: R22/R44/R66, H135/H145, A109 and S-76.",
    "Szybkie wojskowe samoloty bojowe: F-15, F-16, F-35, Typhoon, Rafale i Hawk.":"Fast military combat aircraft: F-15, F-16, F-35, Typhoon, Rafale and Hawk.",
    "Transportowce, tankowce i samoloty patrolowe: C-130, C-17, A400M, KC-135 i P-8.":"Transport, tanker and patrol aircraft: C-130, C-17, A400M, KC-135 and P-8.",
    "Małe samoloty tłokowe: Cessna 172/182, Piper, Cirrus i Diamond.":"Small piston aircraft: Cessna 172/182, Piper, Cirrus and Diamond.",
    "ATR 42/72, Dash 8, Saab 340 i PC-12.":"ATR 42/72, Dash 8, Saab 340 and PC-12.",
    "Gulfstream, Citation, Learjet, Falcon, Challenger i Embraer Legacy.":"Gulfstream, Citation, Learjet, Falcon, Challenger and Embraer Legacy.",
    "Samoloty regionalne i wąskokadłubowe: Embraer E-Jets, CRJ, Airbus A220/A320/A321 oraz Boeing 737/757.":"Regional and narrow-body aircraft: Embraer E-Jets, CRJ, Airbus A220/A320/A321 and Boeing 737/757.",
    "Duże samoloty dalekodystansowe: A330/A350 oraz Boeing 767/777/787 i 747.":"Large long-haul aircraft: A330/A350 and Boeing 767/777/787 and 747.",
    "Największe konstrukcje: Airbus A380, Boeing 747-8 oraz Antonow An-124/225.":"The largest aircraft: Airbus A380, Boeing 747-8 and Antonov An-124/225.",
    "HELIKOPTER":"HELICOPTER","AWARIA":"EMERGENCY","Język interfejsu":"Interface language","Zmniejsz jasność ekranu":"Decrease screen brightness","Zwiększ jasność ekranu":"Increase screen brightness","Responsywność":"Responsiveness","Zbieranie pomiarów…":"Collecting measurements…"
  }));
  const patterns = [
    [/^Rozłącz (.+)$/,"Disconnect $1"],[/^Połączono z (.+)\.$/,"Connected to $1."],[/^Kod ATC · (.+)$/,"ATC code · $1"],[/^(.+) \(zależnie od układu\)$/,"$1 (depending on layout)"],
    [/^Przybliżony kąt wzniesienia: (.+)$/,"Approximate elevation angle: $1"],[/^Stan MLAT: (.+)$/,"MLAT status: $1"],
    [/^Ustawienia Wi-Fi, połączono, siła sygnału (.+)%$/,"Wi-Fi settings, connected, signal strength $1%"],
    [/^Ustawienia Wi-Fi, brak połączenia$/,"Wi-Fi settings, disconnected"],[/^Ustawienia Wi-Fi, niedostępne$/,"Wi-Fi settings, unavailable"],
    [/^Błąd: (.+)$/,"Error: $1"],[/^Nie zapisano: (.+)$/,"Not saved: $1"],[/^Nie udało się rozłączyć: (.+)$/,"Could not disconnect: $1"],
    [/^Nie udało się połączyć: (.+)$/,"Could not connect: $1"],[/^Zapisano sieć\. Trwa nawiązywanie połączenia…$/,"Network saved. Connecting…"],
    [/^(\d+) z (\d+) · teraz bez pozycji: (\d+)$/,"$1 of $2 · currently without position: $3"],
    [/^(\d+) s temu$/,"$1 s ago"],[/^(\d+) min temu$/,"$1 min ago"],[/^(\d+) godz\. temu$/,"$1 h ago"],[/^teraz$/,"now"]
  ];
  function translate(value) {
    const direct=translations.get(value); if(direct)return direct;
    for(const [pattern,replacement] of patterns)if(pattern.test(value))return value.replace(pattern,replacement);
    return value;
  }
  function translated(value) { return language==="en"?translate(value):value; }
  function translateNode(node) {
    if(node.nodeType===Node.TEXT_NODE) {
      const raw=node.nodeValue,trimmed=raw.trim(); if(!trimmed)return;
      let state=textState.get(node);
      if(!state||raw!==state.applied)state={original:raw,applied:raw};
      const originalTrimmed=state.original.trim(),result=translated(originalTrimmed);
      state.applied=state.original.replace(originalTrimmed,result);textState.set(node,state);
      if(raw!==state.applied)node.nodeValue=state.applied;
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    let states=attributeState.get(node);if(!states){states={};attributeState.set(node,states);}
    for(const attribute of ["aria-label","title"])if(node.hasAttribute(attribute)){
      const raw=node.getAttribute(attribute),previous=states[attribute];
      const state=!previous||raw!==previous.applied?{original:raw,applied:raw}:previous;
      state.applied=translated(state.original);states[attribute]=state;
      if(raw!==state.applied)node.setAttribute(attribute,state.applied);
    }
    for(const child of node.childNodes)translateNode(child);
  }
  function apply(root=document.body){if(root)translateNode(root);}
  function setLanguage(next) {
    if(next!=="pl"&&next!=="en"||next===language)return;
    language=next;localStorage.setItem("mamaloty.language",language);document.documentElement.lang=language;
    api.language=language;api.locale=language==="en"?"en-GB":"pl-PL";
    for(const button of document.querySelectorAll("[data-language]")){const active=button.dataset.language===language;button.classList.toggle("active",active);button.classList.remove("pending");button.setAttribute("aria-pressed",String(active));button.disabled=false;}
    apply();dispatchEvent(new CustomEvent("mamaloty-language-change",{detail:{language}}));
  }
  function addSelector() {
    const firstRow=document.querySelector(".settings-card .setting-row"); if(!firstRow)return;
    const row=document.createElement("div"); row.className="setting-row language-setting";
    row.innerHTML='<span>Język</span><div class="language-choice" role="group" aria-label="Język interfejsu"><button type="button" data-language="pl" aria-label="Polski"><svg viewBox="0 0 60 36" aria-hidden="true"><path fill="#fff" d="M0 0h60v18H0z"/><path fill="#dc143c" d="M0 18h60v18H0z"/></svg><small>PL</small></button><button type="button" data-language="en" aria-label="English"><svg viewBox="0 0 60 36" aria-hidden="true"><path fill="#012169" d="M0 0h60v36H0z"/><path stroke="#fff" stroke-width="8" d="m0 0 60 36M60 0 0 36"/><path stroke="#c8102e" stroke-width="4" d="m0 0 60 36M60 0 0 36"/><path stroke="#fff" stroke-width="12" d="M30 0v36M0 18h60"/><path stroke="#c8102e" stroke-width="7" d="M30 0v36M0 18h60"/></svg><small>EN</small></button></div>';
    firstRow.before(row);
    for(const button of row.querySelectorAll("button")) {
      button.classList.toggle("active",button.dataset.language===language);
      button.setAttribute("aria-pressed",String(button.dataset.language===language));
      button.addEventListener("click",()=>{
        if(button.dataset.language===language)return;
        for(const choice of row.querySelectorAll("button")){const active=choice===button;choice.classList.toggle("active",active);choice.classList.toggle("pending",active);choice.setAttribute("aria-pressed",String(active));choice.disabled=true;}
        requestAnimationFrame(()=>setLanguage(button.dataset.language));
      });
    }
  }
  document.documentElement.lang=language;
  const api={language,locale:language==="en"?"en-GB":"pl-PL",apply,setLanguage,translate};
  window.MamalotyI18n=api;
  addSelector(); apply();
})();
