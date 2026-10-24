import { createConfig, http } from 'wagmi';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, rainbowWallet, base, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { defineChain } from 'viem';

export const robinhood = defineChain({
  id: Number(process.env.REACT_APP_ROBINHOOD_CHAIN_ID || 46630),
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.REACT_APP_ROBINHOOD_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Explorer', url: process.env.REACT_APP_ROBINHOOD_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
});
const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID;
export const walletConnectEnabled = Boolean(projectId);
// Without a WalletConnect project ID only the browser-injected wallet is offered.
const groups = projectId
  ? [{ groupName: 'Recommended wallets', wallets: [metaMaskWallet, rainbowWallet, base] }, { groupName: 'Other wallets', wallets: [injectedWallet, walletConnectWallet] }]
  : [{ groupName: 'Browser wallet', wallets: [injectedWallet] }];
export const walletConfig = createConfig({
  chains: [robinhood],
  connectors: connectorsForWallets(groups, {
    appName: 'Frostfish', projectId: projectId || 'frostfish-injected-only',
    appDescription: 'A cozy fishing village on Robinhood Chain Testnet. Demo tokens only.',
    appUrl: process.env.REACT_APP_APP_URL || 'http://localhost:3000',
    appIcon: `${process.env.REACT_APP_APP_URL || 'http://localhost:3000'}/frostfish-icon.svg`,
    walletConnectParameters: { disableProviderPing: true },
  }),
  transports: { [robinhood.id]: http(process.env.REACT_APP_ROBINHOOD_RPC_URL || 'https://rpc.testnet.chain.robinhood.com') },
});
