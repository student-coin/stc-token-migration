import React, {Component} from 'react';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';

import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

import ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json"
import STCSwapper from "./abi/STCSwapper.json"

import './App.css';
import logoSTC from './logoSTC.svg';

const SUPPORTED_NETWORK = 3
const NETWORKS = {1: "mainnet", 3: "ropsten"}
const STCV1ADDR = {1: "0xb8B7791b1A445FB1e202683a0a329504772e0E52", 3: "0x2C62E18C667a8794eA7F0A139F1Ab36A4e696286"}
const STCV2ADDR = {1: "0x15b543e986b8c34074dfc9901136d9355a537e7e", 3: "0x86DC1b4B59E5FA81Ec679B8F108F9b131C60D28A"}
const MIGRATORADDR = {1: "mainnet", 3: "0xd9bdF7ace5d3b7CE9c0cf5f9CB2E620ea088dDCF"}

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

    await this.evalStatus(address, networkId, web3);
    const BN = web3.utils.BN.BN

    await this.setState({
      web3,
      BN: BN,
      provider,
      connected: true,
      address,
      chainId,
      networkId
    });
  }

  async doApprove() {
    const web3 = this.state.web3
    const BN = this.state.BN
    this.state.old_token.methods.approve(MIGRATORADDR[SUPPORTED_NETWORK], new BN(2).pow(new BN(256)).sub(new BN(1))).send({from: this.state.address})
    .on('confirmation', (x) => { this.evalStatus(this.state.address, this.state.networkID, web3) })
  }

  async doSwap() {
    const web3 = this.state.web3
    this.state.migrator_contract.methods.doSwap().send({from: this.state.address})
    .on('confirmation', (x) => { this.evalStatus(this.state.address, this.state.networkID, web3) })
  }

  async evalStatus(address, networkId, web3) {
    const BN = web3.utils.BN.BN
    if (networkId === SUPPORTED_NETWORK) {
        const old_token = new web3.eth.Contract(ERC20.abi, STCV1ADDR[SUPPORTED_NETWORK])
        const new_token = new web3.eth.Contract(ERC20.abi, STCV2ADDR[SUPPORTED_NETWORK])
        const migrator_contract = new web3.eth.Contract(STCSwapper.abi, MIGRATORADDR[SUPPORTED_NETWORK])
        const oldBalance = new BN(await old_token.methods.balanceOf(address).call())
        const oldAllowance = new BN(await old_token.methods.allowance(address, MIGRATORADDR[SUPPORTED_NETWORK]).call())

        const migratorETHBalance = await web3.eth.getBalance(MIGRATORADDR[SUPPORTED_NETWORK])
        const migratorSTCV2Balance = new BN(await new_token.methods.balanceOf(MIGRATORADDR[SUPPORTED_NETWORK]).call())
        const eligibleForRefund = oldBalance.gte(new BN(1000000))
        const canMigratorRefund = false // TODO
        const canSwap = migratorSTCV2Balance.gte(oldBalance.mul(new BN(10 ** 10)).mul(new BN(10 ** 6)))
        const wasApproved = oldAllowance.gte(oldBalance)

        this.setState({
          migrator_contract,
          old_token,
          new_token,
          oldBalance,
          oldAllowance,
          migratorETHBalance,
          migratorSTCV2Balance,
          eligibleForRefund,
          canMigratorRefund,
          canSwap,
          wasApproved
        });
    }
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
<li> The migration bonus might be changed at any time - right now the gas refund is 0.01 ETH </li>
</ol>
</div>
<Button variant="warning" size="lg" onClick={() => {this.setState({eula: true})}}>I understand what I'm doing</Button>
</div>
) : !this.state.connected ?
(
<div>
<Button variant="success" size="lg" onClick={this.onConnect.bind(this)}>Connect wallet</Button>
</div>
) : this.state.chainId !== SUPPORTED_NETWORK ?
(
    <Alert variant="danger"> Unsupported network id! Please switch to {NETWORKS[SUPPORTED_NETWORK]}  </Alert>
) : this.state.oldBalance.isZero() ?
(
    <Alert variant="success"> You don't hold any STCV1 tokens </Alert>
) :
(
<div>
<div> Double check that you use the correct account </div>
<div> Connected account: {this.state.address} </div>
<div> STCV1 balance: {this.state.oldBalance.div(new this.state.BN(10 ** 2)).toString()} </div>
<div> Migrators STCV1 allowance: {this.state.oldAllowance.div(new this.state.BN(10 ** 2)).toString()} </div>
<div> STCV2 available swap supply: {this.state.web3.utils.fromWei(this.state.migratorSTCV2Balance)} </div>
<div> {this.state.eligibleForRefund?"Eligible for gas refund - at the end of the migration you will receive a small ETH refund":"You're not eligible for a gas refund - you hold less than 10k STCV1"} </div>

{ !this.state.canSwap
? (<Alert variant="danger"> Migration contract has insufficient STCV2 - contact STC support.  </Alert>)
: !this.state.wasApproved
? (
<div>
<Button variant="success" size="lg" onClick={this.doApprove.bind(this)}>Approve swap?</Button>
<div> In case the approval got confirmed and the app didn't acknowledge that then reload the Dapp </div>
</div>)
: (
<Button variant="success" size="lg" onClick={this.doSwap.bind(this)}>Swap STCV1 for STCV2?</Button>
)
}


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
