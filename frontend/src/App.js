import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { toast } from 'sonner';
import { useGame } from './hooks/useGame';
import { useAmbience } from './hooks/useAmbience';
import { Header, Welcome, TopHUD, BottomBar, Footer } from './components/GameChrome';
import { WalletDialog } from './components/WalletDialog';
import { EarlyAccessDialog } from './components/EarlyAccessDialog';
import { EarlyAccessParticipantsDialog } from './components/EarlyAccessParticipantsDialog';
import { MarketDialog, InventoryDialog, LeaderboardDialog, GuideDialog, ResetDialog } from './components/InfoDialogs';
import { Toaster } from './components/ui/sonner';
import { SunsetSky } from './components/SunsetSky';
import { WeatherOverlay } from './components/WeatherOverlay';
import { GraphicsDialog } from './components/GraphicsDialog';
import { WalletHandoffNotice } from './components/WalletHandoffNotice';
import { useGraphics } from './hooks/useGraphics';
import { useWalletHandoff } from './hooks/useWalletHandoff';
import { useBoot } from './hooks/useBoot';
import { BootScreen } from './components/BootScreen';
import { CREW_BY_ID } from './lib/gameData';
import './App.css';
import './sunset.css';
import './mobile.css';
import './hud.css';
const World=lazy(()=>import('./game/World').then(module=>({default:module.World})));

export default function App() {
  const { game, gameRef, start, resume, act, busy, online, actionError, clearActionError, leaderboard } = useGame();
  const boot=useBoot(resume);
  const [modal, setModal] = useState(null);
  const [earlyAccessStage, setEarlyAccessStage] = useState(null);
  const [zoom, setZoom] = useState(1), [cameraReset, setCameraReset] = useState(0);
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sound, toggle } = useAmbience();
  const active = !!game;
  const graphics=useGraphics();
  const walletFlow=useWalletHandoff(setModal);
  const close=useCallback(()=>{setModal(null);setEarlyAccessStage(null);},[]);
  const openMarket=useCallback(()=>setModal('market'),[]);
  const openInventory=useCallback(()=>setModal('inventory'),[]);
  const openLeaderboard=useCallback(()=>setModal('leaderboard'),[]);
  const openGuide=useCallback(()=>setModal('guide'),[]);
  const openWallet=useCallback(()=>setModal('wallet'),[]);
  const openEarlyAccess=useCallback(()=>{setEarlyAccessStage(null);setModal('early-access');},[]);
  const playEarlyAccessStage=useCallback((stage)=>setEarlyAccessStage({...stage,startedAt:performance.now()}),[]);
  const openParticipants=useCallback(()=>setModal('early-access-participants'),[]);
  const openGraphics=useCallback(()=>setModal('graphics'),[]);
  const openReset=useCallback(()=>setModal('reset'),[]);
  const roster=useMemo(()=>(game?.workers||[]).map(w=>`${w.uid}:${w.character}:${w.slot}`).join(','),[game]);
  const begin = async (mode) => {
    walletFlow.cancel();
    const wallet = mode === 'wallet' ? { address, chainId, signMessageAsync } : null;
    const state = await start(wallet);
    if (state) { setModal(state.workers.length ? null : 'market'); toast.success(state.workers.length ? 'Welcome back to Frosthaven.' : `Welcome! You have ${state.balance} TOKEN to hire your first fishermen.`); }
  };
  const buy = async (character) => {
    if (!active) { setModal('wallet'); return; }
    clearActionError();
    const state = await act('buy', { character });
    if (state) toast.success(`${CREW_BY_ID[character].name} hired! Heading to the water.`);
  };
  const blocked=!!modal||walletFlow.connectModalOpen||graphics.hidden;
  const tier=graphics.profile.tier;
  return <main className={`frostfish-app ${active?'is-playing':''}`} data-testid="frostfish-app" data-graphics-tier={tier} data-render-paused={blocked&&!(earlyAccessStage&&!active)} data-booted={boot.done}>
    {!boot.done&&<BootScreen targetRef={boot.targetRef} fading={boot.fading}/>}
    <SunsetSky/>
    <Suspense fallback={<div className="world-loading" data-testid="world-loading">Preparing Frosthaven<span>···</span></div>}>
      <World gameRef={gameRef} roster={roster} active={active} zoom={zoom} reset={cameraReset} onMarket={openMarket} onSpot={openMarket} profile={graphics.profile} onMeasure={graphics.measure} blocked={blocked} earlyAccessStage={earlyAccessStage} onReady={boot.frameReady}/>
    </Suspense>
    <WeatherOverlay density={tier==='battery'?.45:graphics.profile.mobile?.7:1}/>
    {!active && <Header onParticipants={openParticipants} onConnect={walletFlow.cancel}/>}
    {!active && <div className="region-caption" data-testid="region-caption"><span className="region-diamond">◇</span><span>THE NORTHERN ISLES</span><span>Somewhere between winter & wonder</span></div>}
    {active ? <><TopHUD game={game} online={online} onLeaderboard={openLeaderboard}/><BottomBar onMarket={openMarket} onInventory={openInventory} owned={game.workers.length}/></> : <Welcome onPlay={openEarlyAccess}/>}
    {actionError && <div role="alert" className="action-error" data-testid="game-action-error">{actionError}<button onClick={clearActionError} data-testid="dismiss-action-error-button" aria-label="Dismiss error">×</button></div>}
    <Footer active={active} sound={sound} onSound={toggle} zoom={zoom} setZoom={setZoom} onResetCamera={()=>{setZoom(1);setCameraReset(v=>v+1);}} onGuide={openGuide} onReset={openReset} onGraphics={openGraphics}/>
    {modal==='wallet'&&<WalletDialog open onClose={close} onStart={begin} onChooseWallet={walletFlow.choose} busy={busy}/>}
    {modal==='early-access'&&<EarlyAccessDialog open onClose={close} connectedAddress={address} onAnimationStage={playEarlyAccessStage}/>}
    {modal==='early-access-participants'&&<EarlyAccessParticipantsDialog open onClose={close}/>}
    {modal==='market'&&<MarketDialog open onClose={close} game={game} onBuy={buy} busy={busy}/>}
    {modal==='inventory'&&<InventoryDialog open onClose={close} game={game} onMarket={openMarket}/>}
    {modal==='leaderboard'&&<LeaderboardDialog open onClose={close} load={leaderboard}/>}
    {modal==='guide'&&<GuideDialog open onClose={close}/>}
    {modal==='graphics'&&<GraphicsDialog open onClose={close} graphics={graphics} onGuide={openGuide} onReset={openReset} active={active}/>}
    {modal==='reset'&&<ResetDialog open onClose={close} busy={busy} onReset={async()=>{const result=await act('reset');if(result){setModal('market');toast.success('A fresh start for Frosthaven.');}}}/>}
    {!modal&&(walletFlow.showNotice||walletFlow.expired)&&<WalletHandoffNotice expired={walletFlow.expired} onRetry={walletFlow.choose} onBack={()=>{walletFlow.cancel();openWallet();}} onDismiss={walletFlow.cancel}/>}
    <Toaster theme="dark" position="top-center" toastOptions={{className:'frost-toast'}}/>
  </main>;
}
