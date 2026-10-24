import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
const KEY='frostfish.wallet-connect-pending';
function readPending(){try{const t=Number(sessionStorage.getItem(KEY));return t&&Date.now()-t<300000?t:0;}catch{return 0;}}
export function useWalletHandoff(setModal){
  const {isConnected}=useAccount();
  const {openConnectModal,connectModalOpen}=useConnectModal();
  const [pending,setPending]=useState(readPending);
  const [expired,setExpired]=useState(false);
  const cancel=useCallback(()=>{setPending(0);setExpired(false);sessionStorage.removeItem(KEY);},[]);
  const choose=useCallback(()=>{
    if(!openConnectModal)return;
    const now=Date.now();sessionStorage.setItem(KEY,String(now));setPending(now);setExpired(false);
    setModal(null);
    // The game dialog unmounts before RainbowKit owns the only focus trap.
    requestAnimationFrame(()=>openConnectModal());
  },[openConnectModal,setModal]);
  useEffect(()=>{
    if(pending&&isConnected&&!connectModalOpen){cancel();setModal('wallet');}
  },[pending,isConnected,connectModalOpen,cancel,setModal]);
  useEffect(()=>{
    if(!pending)return;
    const id=setTimeout(()=>{sessionStorage.removeItem(KEY);setPending(0);setExpired(true);},Math.max(0,300000-(Date.now()-pending)));
    return()=>clearTimeout(id);
  },[pending]);
  return {choose,cancel,connectModalOpen,showNotice:!!pending&&!connectModalOpen,expired};
}