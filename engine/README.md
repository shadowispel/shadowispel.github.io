# Spelhallen 3D – byggguide för alla 3D-spel

Sajten "Spelhallen" (svensk) har fem STORA 3D-spel. Målet är hög nivå: riktiga, genomarbetade spel med mycket innehåll –
inte prototyper. Tänk "litet indie-spel som man faktiskt vill spela i en timme", i webbläsaren.

## Filstruktur
```
ROOT/
  shared.css, shared.js          – gemensam stil + window.Spelhallen (store, best, submit, sfx, init, fmt, isMuted)
  engine/kit.js, engine/kit.css  – 3D-kit (läs kit.js!): Settings, QUALITY, createRenderer, Loop, Input, Audio,
                                   toast, show/hide, loadingScreen, nextFrame, buildSettings, fpsMeter, kv (IndexedDB),
                                   makeRng, lerp, damp, clamp, submitScore, bestScore, fmt
  engine/net.js                  – P2P-multiplayer (WebRTC via Trystero/Nostr, ingen server): createNet, createLobby, V,
                                   backgroundTicker, emoteBar. API och exempel överst i filen. Exempel: games3d/fjallracet/online.js
  vendor/three/three.module.js   – Three.js r170 (lokalt)
  vendor/trystero/               – Trystero 0.22 (MIT) som används av net.js (se VERSION.txt)
  vendor/three/addons/…          – utvalda addons (controls, postprocessing, math/ImprovedNoise+SimplexNoise,
                                   utils/BufferGeometryUtils, objects/Sky+Water, geometries/RoundedBoxGeometry,
                                   math/Capsule+Octree, lines …). Lista: `find vendor/three/addons -name '*.js'`
  games3d/_mall/index.html       – minimal fungerande mall (import map, kit, renderare, loop). KOPIERA DEN som start.
  games3d/<spel-id>/index.html   – ditt spel. Dela upp koden i flera ES-moduler i samma mapp (main.js, world.js, …).
```
- Ändra INTE shared.*, engine/*, vendor/* eller andra spels mappar (fem byggare jobbar samtidigt). Behöver du något mer i kitet:
  lös det lokalt i din mapp och nämn det i rapporten. Behöver du en addon som saknas: skriv egen kod.
- Inga externa resurser (inga CDN, inga bild-/ljudfiler, inga typsnitt utöver Rubik som shared.css redan laddar).
  Allt skapas procedurellt: geometri av Three-primitiver / egna BufferGeometry, texturer ritade på <canvas> (CanvasTexture,
  DataTexture), ljud via kit-Audio (syntes). Det är fullt möjligt att få det SNYGGT: bra ljus (Hemisphere + Directional med
  skuggor), dimma, himmel (Sky-addon eller gradient-shader), tonemapping, färgpalett, partiklar, mjuka animationer, bloom på
  hög kvalitet (EffectComposer + UnrealBloomPass) – men respektera kvalitetsinställningen (låg = inga skuggor/postprocess).

## Krav på varje 3D-spel
1. **Sidan:** `games3d/<id>/index.html` med `<html lang="sv">`, utf-8, viewport, `<title>Namn – Spelhallen</title>`,
   länkar `../../shared.css` och `../../engine/kit.css`, import map exakt som i mallen, `<script src="../../shared.js">`,
   `body.game3d`, `.g3-root`. Anropa `Spelhallen.init('<id>')`. Länk tillbaka till Spelhallen (`../../index.html`) i
   huvudmenyn (klass `g3-back` eller knapp).
2. **Huvudmeny** (g3-screen/g3-panel): titel, kort pitch, Spela/Fortsätt, spellägen, Inställningar (via `buildSettings`
   + spelspecifika extra), Hur man spelar (tangenter + pek), tillbaka till Spelhallen. Laddskärm med förloppsindikator
   om något tar > 0,3 s.
3. **Paus:** Esc/P (och Start på handkontroll) → pausmeny (Fortsätt, Inställningar, Huvudmeny). Auto-paus vid
   `visibilitychange`/`blur` och när pointer lock släpps (i spel som använder pointer lock). Ingen tid får "läcka" i paus.
4. **Introduktion:** första gången: kort interaktiv tutorial eller tydliga tips i spelet. Ingen ska behöva läsa en manual.
5. **Progression & sparning:** framsteg (upplåsta banor, uppgraderingar, världar, rekordtider…) sparas via
   `Spelhallen.store` (små data) eller `kv` (stora data, t.ex. voxelvärldar). Rekord rapporteras med
   `submitScore('<id>', poäng)` (en gång per omgång/bana; välj ett vettigt poängmått).
6. **Styrning:** tangentbord+mus (pointer lock för förstapersons-/kamerastyrning), handkontroll (kit Input: `Pad0..`,
   `gpAxis`), och pekskärm (`input.setupTouch` – spakar + knappar). Visa styrning i hjälp. Förhindra sidscroll.
7. **Prestanda:** 60 FPS på en vanlig laptop på "Medel". Använd kvalitetsinställningen (`settings.q`: pixelRatio, shadows,
   shadowSize, view = siktavståndsfaktor). Återanvänd geometrier/material, använd InstancedMesh för många likadana objekt,
   slå ihop statisk geometri (BufferGeometryUtils.mergeGeometries), poola partiklar/projektiler, dispose() det som tas bort.
   Undvik att allokera nya objekt per bildruta i heta loopar.
8. **Spelkänsla:** responsiv styrning, kamera som känns bra (mjuk, kolliderar inte genom väggar), tydlig feedback (ljud,
   partiklar, skärmskak dämpat, HUD), rättvis svårighetskurva, variation, belöningar. Musik via `audio.music('tema')`
   (calm, adventure, action, space, night, tense, victory) eller eget tema-objekt.
9. **Text:** all text på korrekt svenska (å, ä, ö). Inga engelska rester i UI.
10. **Robusthet:** inga konsolfel/varningar, ingen NaN-kamera, inga fall genom golvet, inga minnesläckor vid omstart
    (rensa scen, dispose), fungerar efter fönsterstorleksändring, mobil liggande/stående.
11. **Originalitet:** genren får likna kända spel, men namn, figurer, grafik, musik och banor ska vara egna.

## Test
- Lokal server kör redan: `http://localhost:8765/games3d/<id>/index.html` (starta ingen ny server; ändra inte .claude/).
- Webbläsare: använd `mcp__Claude_Browser__*`. VIKTIGT: flera byggare delar samma webbläsarpanel – skapa EN EGEN flik med
  `tabs_create` och ange alltid ditt `tabId` i varje anrop. Rör inte andras flikar. Panelen kan vara dold → låg FPS;
  mät prestanda genom att tidsmäta din update/render i JS, inte via FPS-räknaren. Läs konsolen ofta.
- Node finns INTE. Syntaxkontroll: `"/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc" -m fil.js`
  fungerar inte med import av 'three' – använd i stället webbläsaren (konsolfel) eller jsc på rena logikmoduler.
  Testskript/tempfiler läggs under `/private/tmp/<id>-test/`, aldrig i ROOT.
- Rensa testdata du själv skrivit i localStorage/IndexedDB för ditt spel när du är klar (inte andras).

## Arbetssätt (viktigt)
1. Planera innehållet först (lägen, banor, fiender, föremål, progression) – sikta högt.
2. Bygg en spelbar kärna tidigt, testa i webbläsaren, bygg sedan ut innehåll och polish.
3. Gör därefter minst två kritiska granskningsrundor: spela som en kräsen spelare, skriv en lista över ALLT som är dåligt
   (buggar, tråkigt, fult, otydligt, orättvist, långsamt) och fixa. Upprepa tills inget meningsfullt återstår.
4. Slutrapport (max ~25 rader, svenska): innehåll, styrning, poängmått, vad du granskat/fixat, vad som är otestat.
