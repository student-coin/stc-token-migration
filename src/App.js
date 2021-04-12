import React, {Component} from 'react';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';

import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

import './App.css';
import logoSTC from './logoSTC.svg';

const SUPPORTED_NETWORK = 3
const NETWORKS = {1: "mainnet", 3: "ropsten"}

function initWeb3(provider: any) {
  const web3: any = new Web3(provider);

  web3.eth.extend({
    methods: [
      {
        name: "chainId",
        call: "eth_chainId",
        outputFormatter: web3.utils.hexToNumber
      }
    ]
  });

  return web3;
}

const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: '6a994151aa4a42fb89d772c6f1f00db7'
        }
      }
    };

class App extends Component {
  constructor(props) {
    super(props);
    this.state = { eula: false };
    this.web3Modal = new Web3Modal({
      network: NETWORKS[SUPPORTED_NETWORK],
      cacheProvider: false,
      providerOptions: providerOptions
    });
  }

  async onConnect() {
    const provider = await this.web3Modal.connect();

    await this.subscribeProvider(provider);

    const web3 = initWeb3(provider);

    const accounts = await web3.eth.getAccounts();

    const address = accounts[0];

    const networkId = await web3.eth.net.getId();

    const chainId = await web3.eth.chainId();

    if (networkId === SUPPORTED_NETWORK) {

    }

    await this.setState({
      web3,
      provider,
      connected: true,
      address,
      chainId,
      networkId
    });
  }

  subscribeProvider(provider) {
    if (!provider.on) {
      return;
    }
    /* TODO: Make is saner - don't reload the app... */
    provider.on("close", () => {window.location.reload(false);});
    provider.on("accountsChanged", async (accounts: string[]) => {
      window.location.reload(false);
    });
    provider.on("chainChanged", async (chainId: number) => {
       window.location.reload(false);
    });

    provider.on("networkChanged", async (networkId: number) => {
       window.location.reload(false);
    });
  };

  render() {
  return (
<div className="App">
<div class="wrapper">

<div></div>
<div></div>
<div></div>
<div></div>
<div>
<img src={logoSTC} className="App-logo" alt="logo" />
<div className="App-logo-text">
<h2>STCV2 Token migration</h2>
{/*
<h4> STCV1: <a href="https://etherscan.io/token/0xb8B7791b1A445FB1e202683a0a329504772e0E52">0xb8B7791b1A445FB1e202683a0a329504772e0E52</a> </h4>
<h4> STCV2: <a href="https://etherscan.io/token/0x15b543e986b8c34074dfc9901136d9355a537e7e">0x15b543e986b8c34074dfc9901136d9355a537e7e</a> </h4>
*/}
{ !this.state.eula ? (
<div>
<div className="App-eula">
<ol>
<li> Only access this app if you're a holder of STCV1 </li>
<li> NEVER send STCV1 directly to the migration contract </li>
<li> If you disregarded 2) then contact STC support </li>
<li> You need to have ETH in your wallet in order to swap STCV1 for STCV2 </li>
<li> The swap is irreversible </li>
<li> We will swap all of your STCV1 - smaller swaps are disallowed </li>
<li> We will ask you to perform 2 ETH transactions </li>
<li> When swapping more than 10k STCV1 you will receive a full/partial gas refund for both transactions </li>
</ol>
</div>
<Button variant="warning" size="lg" onClick={() => {this.setState({eula: true})}}>I understand what I'm doing</Button>
</div>
) : !this.state.connected ?
(
<div>
<Button variant="success" size="lg" onClick={this.onConnect.bind(this)}>Connect to wallet</Button>
</div>
) : this.state.chainId !== SUPPORTED_NETWORK ?
(
    <Alert variant="danger"> Unsupported network id! Please switch to {NETWORKS[SUPPORTED_NETWORK]}  </Alert>
) :
(
<div>
<div> Double check that you use the correct account </div>
<div> Connected account: {this.state.address} </div>
<div> STCV1 balance: {this.state.address} </div>
<div> STCV2 balance: {this.state.address} </div>
</div>
)
}

</div>
</div>
<div></div>
<div></div>
<div></div>
<div></div>

</div>
</div>
  );
}
}

export default App;
