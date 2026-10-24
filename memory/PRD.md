# Frostfish — PRD

## Original problem statement
Pull https://github.com/Dostarki/fishsnow, run it, fix bugs. Then (TR): map 2.5x bigger; fishing & carrying animations; fish emoji above hired workers; morning/noon/evening/night; worker energy — rod rests 2 min after 20 fish, net after 100, boat after 200, sleeps in a hammock with "ZzzZ"; more vivid colors; no pause/speed buttons; no navbar in-game; top-right TOKEN, left of it Rewards, left of that active workers; top-left Leaderboard; bottom Market + INVENTORY; dynamic detailed game buttons; falling snow, sometimes rain with effects; Market sells workers with daily yield, unlimited purchases; Inventory shows owned workers.

## Architecture
React19/CRA + React Three Fiber voxel world, FastAPI + MongoDB, anonymous bearer sessions, RainbowKit (injected wallet only unless REACT_APP_WALLETCONNECT_PROJECT_ID set). Server-authoritative closed-form worker cycle (game.py phase/delivered_trips) mirrored in frontend lib/gameData.js workerPhase for animation.

## Implemented (2026-10-13)
- Fixed: missing frontend env (Robinhood chain 46630 RPC/explorer) + WalletConnect projectId crash; obsolete crew/placement flow removed.
- Economy v2: start 100 demo TOKEN; prices rod 10 / net 25 / boat 60; daily 100/250/600; unlimited hires; deliveries credit TOKEN + lifetime Rewards; villagers buy market stock (cosmetic).
- Shift limits 20/100/200 fish, 2-min hammock nap, energy bar, fish emoji (pixel fallback), ZzzZ sprite; casting rod anim, jumping fish, bucket carry walk, boat sails to harbor dock.
- 2.5x terrain (90x57 tiles) with lakes, hamlets, forests, hills; camera bounds widened.
- Wall-clock day cycle (8 min) for lights/ocean/CSS sky (sun/moon/stars); weather every 2 min (snow / rain w/ splashes + lightning).
- New HUD: leaderboard (top-left), workers/rewards/TOKEN (top-right), Market/Inventory buttons (bottom), /api/leaderboard.
- Tests: iteration_3 backend 100%, frontend 100%.

## Backlog
- P1: WalletConnect project ID from user to enable MetaMask/Rainbow/Base mobile wallets.
- P1: Worker upgrades (faster nets, energy boosts), worker selling.
- P2: Real token integration (only after user provides token details); wallet-signed identity for leaderboard names.

## Iteration 4 (June 2026) — Boot screen, lights, scenery, Robinhood plaza, realistic fishing
- Pixel-art boot screen (`components/BootScreen.jsx`, `hooks/useBoot.js`, `boot.css`): bucket art, "Loading your island…", progress bar driven by real steps (World chunk → saved session resume via `useGame.resume()` → first rendered frame). `frostfish-app[data-booted]`. Returning players auto-resume into the game.
- Light glow: `game/Glows.jsx` — instanced halo billboards + warm ground pools for every lamp/window/torch (positions from `buildVillage().lamps`), point lights on main lamps/lighthouse/torches, intensity rises at evening/night. `voxelLiteMaterial` now follows the day cycle (uBright/uTint).
- Scenery: `game/Scenery.jsx` — icy voxel mountain ring (north/west/east, never occluding the island), icebergs in the open sea away from boat lanes, drifting translucent voxel clouds.
- Robinhood plaza (`villageBuilder.plaza`, centre 23.5,5.5) with green/gold `Banner` mesh (`Models.jsx`), torches, fence, stairs, pink trees; pines excluded from the area.
- Welcome: right-side "YOUR NEXT ADVENTURE" info card removed.
- Fishing animation (`game/fishingAnim.js`, `Workers.jsx`): rod now points toward the water (fixed ROD_BASE orientation in `mergedModels.js`), cast wind-up/whip, flying bobber + sagging line, ripples, nibble, hook snap with body lean, fish reeled to the bucket with splash rings; net workers raise/plunge/sweep/lift.
- Tests: `test_reports/iteration_4.json` — frontend 5/5 scenarios pass (boot, welcome cleanup, core buy flow, auto-resume, mobile). Backend unchanged (iteration_3: 11/11).
- Backlog: user visual acceptance; optional lighthouse rotating beam; cloud shadows (needs shadow-map auto update).
