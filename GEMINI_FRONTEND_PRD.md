# 🏎️ TRADER RACE 3D — Frontend UI, 3D Environment, Physics & Boost Upgrade PRD (For Gemini 4 Argon)

## 📌 1. ROLE & HIGH-LEVEL OBJECTIVE
You are upgrading **ONLY the frontend (`turbo_usdt_racer_3d.html` and its identical copy `index.html`)** of **TRADER RACE 3D**, a Telegram Mini App 3D racing & USDT betting game.

### 🚨 STRICT GOLDEN RULES (DO NOT VIOLATE)
1. **BACKEND & DEPLOY FILES 100% UNTOUCHED:**
   - Do **NOT** modify, rename, or delete `telegram_bot_server.py`, `wallet.py`, `requirements.txt`, `.env`, `install.sh`, `tunnel_watch.sh`, `README.md`, `CHANGES.md`, or `app_version.txt`.
   - When returning the final deliverable, package the **complete ZIP file** with all backend/config files preserved byte-for-byte alongside your upgraded `turbo_usdt_racer_3d.html` and `index.html` (which must be identical copies of each other).
2. **HTML PREVIEW LINK / LIVE PREVIEW:**
   - Provide an **interactive HTML Preview Link / Canvas Preview** of `turbo_usdt_racer_3d.html` so the user can immediately test the new UI, tabs, 3D graphics, physics, and Boost button in their browser on Android before deploying.
   - When opened in a standard browser preview outside Telegram (no `window.Telegram.WebApp.initData` or no `?api=` backend reachable), the app **must boot cleanly in `DEMO` mode ($1,000 USDT demo balance)** with zero blocking popups or console errors.
3. **SERVER-AUTHORITATIVE API & DOM CONTRACT 100% PRESERVED:**
   - All live balances, bets, race winners, investments, referrals, leaderboard rows, deposits, and withdrawals come from `telegram_bot_server.py`.
   - Keep all `/api/*` endpoints, `X-Telegram-Init-Data` header authentication, `?api=` query param discovery, and all required DOM IDs/classes intact (full checklist in **Section 8**).

---

## 🔍 2. AUDIT OF CURRENT FRONTEND ISSUES (WHAT YOU MUST FIX)

A line-by-line audit of `turbo_usdt_racer_3d.html` revealed the exact causes of the UI, theme, font, icon, and overlap issues:

### 2.1 Broken CSS & Theme Mismatch ("theme bilkul sahi nhi hai")
1. **Nested `<style>` & Corrupted CSS Rule (Lines 2323 & 2385–2386):**
   - `<style id="tr-v3-css">` at line 2323 is opened *inside* the existing `<style>` tag without closing the first `</style>`.
   - Lines 2385–2386 contain an orphaned CSS declaration without a selector (`background:#ffffff!important;...}`) left over from removing the light theme, breaking CSS rules around `.header-sfx-btn`.
2. **Clashing Blue/Purple/White Templates vs. Dark Grey-Black Theme:**
   - `.status-strip` uses a loud royal-blue gradient (`linear-gradient(180deg, #0984e3, #1799ff)`).
   - `#screenInvest`, `#screenInvite`, `#screenProfile`, and `#screenAuth` were merged from an older template that uses bright blue backgrounds (`rgba(15, 82, 190, 0.45)`), royal-blue wallet cards (`#2b8eff` to `#0542b2`), purple/orange cards, and a white `.auth-card`.
   - **REQUIRED FIX:** Unify **100% of screens, headers, status strips, cards, and modals** into a single **AAA Dark Metallic Grey-Black Carbon Racing Theme**:
     - Primary Background: `#090b10` → `#0e121a` (deep carbon black/gunmetal)
     - Card / Panel Surface: `linear-gradient(180deg, #161b26 0%, #10141d 100%)` with `1px solid rgba(255, 255, 255, 0.09)` subtle metallic border and `border-radius: 14px`
     - Elevated / Active Surface: `#1c2230` with `1px solid rgba(40, 224, 102, 0.45)` or `rgba(255, 196, 18, 0.45)`
     - Primary Accent (CTA / Win): `#28e066` (Racing Emerald Green)
     - Secondary Accent (VIP / Trophy / Gold): `#ffc412` (Championship Gold)
     - Telemetry Accent: `#38bdf8` (Crisp Ice Cyan — used sparingly for badges/speed)
     - Text Hierarchy: `#f8fafc` (Primary), `#94a3b8` (Secondary/Muted), `#64748b` (Labels)
     - **NO light theme, NO white cards, NO bright royal-blue status strips.**

### 2.2 VIP Investment Plans Screen (`#screenInvest` — "icons fonts bohot bada hai & buttons touch/overlap")
1. **Why it looks broken right now:**
   - `.investment-head h1` is `24px` italic uppercase with a huge `28x28px` trophy icon.
   - `.invest-card` (line 1404) forces a **4-column horizontal grid (`grid-template-columns: 32% 22% 23% 23%`)** on a 360px mobile screen! Each column is only ~75px wide, causing the `58px` car image, `19px` tier badge, `18px` USDT numbers, `18px` orange Rider Share box, and the 2-line `INVEST<br>NOW` button (`min-height: 44px; font-size: 15px`) to touch, squish, and overlap.
   - `.invest-note-car` (line 1546) has `width: 125%; margin-left: -10%`, overflowing into the text.
2. **REQUIRED FIX for `#screenInvest`:**
   - **Header:** Compact header (`padding: 12px 14px 8px`), title `16px` (`font-weight: 800`), trophy icon `18x18px`, subtitle `11px` (`#94a3b8`).
   - **Segmented Tabs (`#tabExplorePlansBtn`, `#tabMyInvestmentsBtn`):** Sleek dark pill switcher (`height: 36px`, `font-size: 11.5px`, `gap: 6px`, `padding: 3px`, background `#0c0f16`, active tab `#1e2536` with `#28e066` bottom accent).
   - **Redesigned `.invest-card` Layout (Clean 2-Row Card, ZERO 4-Column Squishing):**
     - Preserving `<article class="invest-card">` and all `data-plan`, `data-cost`, `data-daily`, `data-duration` attributes on `button.invest-now`:
     - **Top Row (`display: flex; align-items: center; justify-content: space-between; gap: 10px`):**
       - Left: Tier Car Image (`width: 56px; height: 34px; object-fit: contain`) + Tier Name (`14px` bold, badge icon `14x14px`) + Tier Subtitle (`10px` `#94a3b8`).
       - Right: Compact Rider Share pill (`font-size: 10px`, `padding: 3px 8px`, `border-radius: 6px`, `#1c2230`) + single-line **`INVEST NOW`** button (`height: 32px`, `padding: 0 12px`, `font-size: 11px`, `border-radius: 8px`, single line `white-space: nowrap`).
     - **Bottom Row (`display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06)`):**
       - Col 1 (Investment): Label `9px` `#64748b` → Value `13px` bold `#f8fafc` (e.g. `10 USDT`)
       - Col 2 (Daily Profit): Label `9px` `#64748b` → Value `13px` bold `#28e066` (e.g. `0.50 USDT (5%)`)
       - Col 3 (Duration / Max): Label `9px` `#64748b` → Value `12px` bold `#cbd5e1` (e.g. `120 Days • Max 2`)
   - **Fix `.invest-note`:** Normal flex card (`gap: 10px; padding: 10px 12px`), car image `width: 64px; height: 40px; margin: 0`.

### 2.3 Top Header, Edges, Corners & Button Spacing Across All Screens
1. **Top Header (`.top-header`):**
   - Currently crams 5 items into 360px with `balance-box { min-width: 148px }`, making buttons touch and clip the right edge.
   - **REQUIRED FIX:**
     - Set `.top-header` to `padding: 8px 10px; gap: 6px; align-items: center; background: #0c0f16; border-bottom: 1px solid rgba(255,255,255,0.08)`.
     - `.profile-box`: compact pill (`max-width: 115px`, avatar `28x28px`, `.profile-name` `11px` with `text-overflow: ellipsis`, `.profile-id` `8.5px`).
     - `.balance-box`: remove `min-width: 148px`! Use `flex: 1 1 auto; min-width: 0; height: 32px; padding: 0 8px; border-radius: 9px; background: #151a24; border: 1px solid rgba(255,255,255,0.1)`. `#balanceText` font-size `12px` tabular-nums.
     - `#headerSoundBtn`: `32x32px` rounded-square (`border-radius: 8px`, `#151a24`), never touching adjacent buttons.
     - `.tr-mode-wrap` (`#trModeChev` `^` Live/Demo dropdown): `28x32px` rounded-square (`border-radius: 8px`), cleanly spaced.
     - `#depositBtn`: `height: 32px; padding: 0 10px; font-size: 11px; border-radius: 8px; flex-shrink: 0`.
2. **Status Strip (`.status-strip`):**
   - Replace bright royal-blue background with dark carbon `#0e121b`, `padding: 5px 10px; gap: 8px`, 3 sleek dark telemetry pills (`#151a24`, `border-radius: 8px`, `padding: 4px 8px`).
3. **3D Viewport HUD & Controls (`.viewport-wrap`, `.bottom-console`):**
   - **Left HUD Stack (`.left-hud-stack`):** Make the 4 info buttons (`#leaderboardBtn`, `#modeSelectHudBtn`, `#raceInfoBtn`, `#howToPlayBtn`) compact icon+label pills (`height: 26px; padding: 0 8px; font-size: 9.5px; gap: 5px; border-radius: 7px; background: rgba(12, 15, 22, 0.82); backdrop-filter: blur(6px)`) with `gap: 5px` so they never collide with the bottom of the canvas.
   - **Bottom Console (`.bottom-console`):**
     - Ensure `padding: 8px 10px; gap: 8px; background: #0c0f16`.
     - Integrate the Custom Bet input (`#trCustomBet` and `#trCustomBetGo`) cleanly inside the wager section so both top cards (`.wager-grid`) have matching heights and zero overflowing/touching buttons.
     - Minimum `6px` gap between `.preset-pill` buttons (`height: 26px; font-size: 10.5px; border-radius: 6px`).
     - Minimum `8px` gap between the 3 car cards in `#consoleCarBetGrid` (`border-radius: 10px; padding: 6px`).
     - Minimum `10px` gap between `#btnLeft`, `#btnRight` (`46x46px` tactile dark metallic buttons) and `#btnAccel`, `#btnBrake`.
4. **Invite (`#screenInvite`) & Profile (`#screenProfile`) Screens:**
   - Change all cramped 4-column grids (`.tier-row`, `.referral-stats`, `.why-grid`) to **2x2 grids (`grid-template-columns: repeat(2, 1fr); gap: 8px`)** so cards have generous breathing room on 360px screens.
   - Shrink `.invite-hero h1` from `26px` to `18px`, `.balance-big` in `.wallet-card` from `36px` to `22px`, and `.avatar` in `.profile-head` from `62px` to `46px`.
   - Replace the bright blue `.wallet-card` gradient with a sleek dark carbon-gold/emerald metallic card (`linear-gradient(135deg, #161c28 0%, #0f131c 100%)`, `border: 1px solid rgba(40,224,102,0.35)`).
   - Ensure `.wallet-buttons` (`#profileDepositBtn`, `#profileWithdrawBtn`) have `gap: 10px` and `height: 38px`.

---

## ⚡ 3. NEW FEATURE: ON-SCREEN NITRO / BOOST BUTTON (+20% SPEED FOR 0.5s, 5s COOLDOWN)

Add a dedicated, tactile **⚡ BOOST** button on the racing screen (inside `.viewport-wrap` HUD, e.g., bottom-right above the console or integrated beside the driving controls so it is accessible in **both** Car Bet Auto Mode and Manual Drive Mode during `RACING`):

### Exact Mechanics & Specs:
1. **DOM Element:**
   - Button ID: `id="raceBoostBtn"` (with child label/timer and radial or bar cooldown progress fill).
   - Position: Inside `.viewport-wrap` at `bottom: 12px; right: 12px; z-index: 26` (sized `54x54px` circular arcade nitro button with a glowing cyan/emerald ring, flame/lightning icon `⚡`, and `BOOST` / cooldown timer label).
2. **Activation Rules:**
   - Can only be triggered when `gameState === 'RACING'` and `boostCooldownTimer <= 0`.
   - When tapped (or `Shift` / `B` key pressed on keyboard):
     - Sets player car's active boost: `player.manualBoostTimer = 0.50` (0.5 seconds duration).
     - Starts a **5.0-second cooldown**: `boostCooldownTimer = 5.0`.
     - During the **0.5s active window**, the player car's target/current speed is increased by **+20%** (`speed *= 1.20`, capped at `EQUAL_TOP_SPEED * 1.20` = `~310 KM/H` or stacked smoothly with track boosters), with instant acceleration surge, blue/cyan twin afterburner exhaust flames, intense speed-lines, subtle camera FOV zoom-out, `sfxBoost()`, and `triggerHaptic([40, 20, 60])`.
3. **Cooldown Visuals (5.0s):**
   - While `boostCooldownTimer > 0`, `#raceBoostBtn` shows a disabled/recharging state (`opacity: 0.65`), a sweeping radial/vertical progress fill (`(5 - boostCooldownTimer) / 5`), and a live numeric countdown (`4.8s`, `3.2s` ... `READY`).
   - When `boostCooldownTimer` reaches `0`, the button flashes ready (`READY ⚡`).
4. **Server Outcome Compatibility:**
   - Remember that in `LIVE` mode (and `DEMO` mode), `designatedWinnerId` is determined at race start (`pendingBet.winner`). Allow the player's 0.5s +20% boost to genuinely surge the player car forward in real time, while keeping the final-stretch AI rubber-banding (`inFinalStretch` when `raceProgress > 0.78`) smart enough so that `designatedWinnerId` still crosses `FINISH_LINE_Z` first at the end of the race.

---

## 🌍 4. REALISTIC 3D ENVIRONMENT, CLIMATE, CARS & PHYSICS UPGRADE

Upgrade the 3D highway canvas (`#raceCanvas`) so it looks and feels like a true **AAA mobile racing game**:

1. **Realistic Trees, Grass, Roadside Buildings, Clouds & Climate (`renderScene`):**
   - **Ground & Grass:** Draw perspective-projected alternating mowed grass strips (`#1e4d2b` / `#163d22` in sunny, wet dark moss in rain, golden olive in sunset, frosted snow banks in snow) and red/white or yellow/black 3D concrete rumble curbs along the road edges (`±1.0` to `±1.12`).
   - **Road Asphalt:** Add moving asphalt micro-grain/tar-seam perspective lines, lane reflector cat's-eyes that glint as they pass the camera, and wet specular road reflections of tail lights during `rain` and `sunset`.
   - **3D Roadside Buildings & Scenery:** In addition to the distant horizon skyline (upgrade buildings with 3D perspective depth, lit window grids, rooftop antennas/warning beacons, and atmospheric fog fade), render **3D perspective roadside structures** scrolling past outside the guardrails (modern glass/steel city towers, highway light poles casting light pools, overhead highway gantry signs, and multi-layered 3D pine/oak trees with bark shading, shadow cones, and foliage clusters).
   - **Volumetric Clouds & Dynamic Sky:** Multi-layered soft volumetric clouds with sunlit top edges and shadowed undersides, dynamic sun/moon disc with atmospheric lens glow, angled wind-driven rain streaks + road splash spray in `rain`, and swirling depth-scaled snowflakes in `snow`.
2. **Realistic Cars & Real Physics (`updateSimulation` & `drawMustangGT3D`):**
   - **Suspension & Chassis Dynamics:**
     - **Pitch (Dive/Squat):** Car body squats slightly (`+1.5px` rear drop) under hard acceleration/Boost and dives forward under braking/collision.
     - **Body Roll & Steering Inertia:** Smooth lateral velocity (`vx`) with spring-damped body roll angle (`car.rollAngle`) when changing lanes, plus high-frequency road micro-vibration at 200+ KM/H.
     - **Wheel Rotation & Tire Marks:** Visible wheel tread/rim spin animation proportional to `car.speed`, twin dark skid marks / tire smoke puffs when swerving or braking hard.
   - **Realistic Obstacle & Car-to-Car Collision Physics:**
     - Momentum-based impulse transfer on side-slams and rear bumps, metallic spark particles (`#fde047`, `#fb923c`, `#ffffff`) flying off contact points with gravity + road bounce, realistic rotational jolt (`hitRoll`), and damped camera shake.
   - **Car Labels Preserved:** Keep the floating tags above cars (`YOU` in green with pointer arrow on the player's car; `Player 2` / `Player 3` with the `AI` badge on opponent cars).

---

## 🔒 5. STRICT BACKEND API & DOM PRESERVATION CHECKLIST

Your upgraded `turbo_usdt_racer_3d.html` **MUST** keep the v3 overlay script (`(function () { 'use strict'; ... })()`) working without any regressions.

### 5.1 Backend API Endpoints (Must NOT Change)
- `GET /api/state` (Header: `X-Telegram-Init-Data`) → returns `{ ok, user, balance, profit_balance, ref_avail, ref_life, referrals, ref_link, deposit_address, network, settings, investments, transactions, bets, withdrawals }`
- `GET /api/leaderboard` → returns `{ ok, board: [{ rank, user_id, name, wins, profit, net }], empty, refreshes_in }`
- `GET /api/config` & `GET /health`
- `POST /api/bet` → body `{ amount, mode, car }` → returns `{ ok, result: { bet_id, winner, payout, mult, amount }, ...user_state }`
- `POST /api/race/result` → body `{ bet_id }` → reveals & settles the finished race
- `POST /api/invest` → body `{ plan }` (where `plan` is `"Bronze"`, `"Silver"`, `"Gold"`, `"Diamond"`, or `"VIP 4"`)
- `POST /api/invest/claim` → body `{ id }`
- `POST /api/withdraw` → body `{ amount, address }`
- `POST /api/ref/withdraw` → moves available referral commission to main balance

### 5.2 Required DOM IDs & Selectors (Must Exist in HTML)
- **Header & Mode:** `.top-header`, `.profile-box`, `.profile-name`, `.profile-id`, `.balance-box`, `#balanceText`, `#headerSoundBtn`, `#headerSoundIcon`, `#depositBtn`, `#quickTopupBtn` (or keep wired safely), `#trModeChev`, `#trModeMenu`
- **Status Strip & Viewport:** `.status-strip`, `#raceIdText`, `#joinedText`, `#poolText`, `#timerText`, `.viewport-wrap`, `#raceCanvas`, `#topPosBanner`, `#weatherCycleBtn`, `#weatherBtnText`, `#leaderboardBtn`, `#modeSelectHudBtn`, `#raceInfoBtn`, `#howToPlayBtn`, `#speedNum`, `#soundToggleBtn`, `#hapticToggleBtn`, `#centerStartCircle`, `#circleTopTxt`, `#circleBigNum`, `#circleBotTxt`, `#standaloneCountdown`, `#cdSubLabel`, `#cdGiantDigit`, `#raceBoostBtn` (NEW)
- **Bottom Console:** `.bottom-console`, `#betMinusBtn`, `#betPlusBtn`, `#betAmountText`, `.preset-row`, `.preset-pill[data-bet]`, `#payoutText`, `#modePillAutoBet`, `#modePillManualDrive`, `#consoleModeLabel`, `#consoleCarBetGrid`, `.console-car-card[data-car-theme]`, `#manualControlsGrid`, `#btnLeft`, `#btnRight`, `#btnAccel`, `#btnBrake`
- **Screens & Bottom Nav:** `#screenRaceBet`, `#screenInvest`, `#screenInvite`, `#screenProfile`, `#screenAuth`, `.bottom-nav`, `#navInvestBtn`, `#navBetBtn`, `#navInviteBtn`, `#navProfileBtn`
- **Invest Screen:** `#tabExplorePlansBtn`, `#tabMyInvestmentsBtn`, `#myInvestCount`, `#investExploreList`, `#investMyList`, `#myInvestmentsContainer`, `.invest-card`, `.invest-now[data-plan][data-cost][data-daily][data-duration]`
- **Invite Screen:** `#refProgressCount`, `#refProgressBar`, `#refProgressSub`, `#statTotalRefs`, `#statActiveRefs`, `#statLifetimeComm`, `#statAvailComm`, `#withdrawRefBtn`, `.ref-link`, `.ref-value`, `[data-copy]`, `[data-share]`
- **Profile Screen:** `.profile-body`, `#profileTitleText`, `#profileUsernameText`, `.wallet-card`, `#profileMainBalance`, `#profileProfitBalance`, `#profileDepositBtn`, `#profileWithdrawBtn`, `#bonusLockedVal`, `#unlockBonusBtn`, `#statTotalInvest`, `#statTotalProfit`, `#statDailyProfit`, `#menuBetHistoryBtn`, `#menuRaceHistoryBtn`, `#menuTxHistoryBtn`, `#menuReferEarnBtn`, `#menuLanguageBtn`, `#menuSecurityBtn`, `#menuSupportBtn`, `#menuAuthScreenBtn`
- **Modals & Toasts:** `#modeModalBackdrop`, `#closeModeModalBtn`, `#cardMode2`, `#cardMode3`, `#selectMode2Btn`, `#selectMode3Btn`, `.car-choice-btn[data-car]`, `#resultModalBackdrop`, `#closeModalBtn`, `#modalSvgHolder`, `#modalTitle`, `#modalSubtitle`, `#modalBodyContent`, `#modalActionBtn`, `#crToast`

---

## 📦 6. DELIVERABLES CHECKLIST FOR GEMINI 4 ARGON
1. **Interactive HTML Preview Link:** Render/share the live preview of the upgraded `turbo_usdt_racer_3d.html` so the user can test all 4 tabs (`INVEST`, `BET (PLAY)`, `INVITE`, `PROFILE`), the new dark grey-black theme, the fixed VIP investment cards, the 3D environment/physics, and the `0.5s +20% / 5s cooldown` Boost button right in their browser.
2. **Complete Updated ZIP (`trader_race_v3.zip`):**
   - Contains the upgraded `turbo_usdt_racer_3d.html` and identical `index.html`.
   - Contains all original backend and deployment files (`telegram_bot_server.py`, `wallet.py`, `requirements.txt`, `.env`, `install.sh`, `tunnel_watch.sh`, `README.md`, `CHANGES.md`, `app_version.txt`) **100% unmodified**.
