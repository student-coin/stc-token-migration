import React, { Component } from "react";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";

import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

import ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json";
import STCSwapper from "./abi/STCSwapper.json";

import "./App.css";
import logoSTC from "./logoSTC.svg";

const targetNetworkID = +process.env.REACT_APP_TARGET_NETWORK_ID;
const targetNetworkName = process.env.REACT_APP_NETWORK_NAME;
const addrStcv1 = process.env.REACT_APP_ADDR_STCV1;
const addrStcv2 = process.env.REACT_APP_ADDR_STCV2;
const addrMigrator = process.env.REACT_APP_ADDR_MIGRATOR;
const infuraId = process.env.REACT_APP_INFURA_ID;

function initWeb3(provider) {
  const web3 = new Web3(provider);

  web3.eth.extend({
    methods: [
      {
        name: "chainId",
        call: "eth_chainId",
        outputFormatter: web3.utils.hexToNumber,
      },
    ],
  });

  return web3;
}

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId,
    },
  },
};

class App extends Component {
  constructor(props) {
    super(props);
    this.state = { eula: false };
    this.web3Modal = new Web3Modal({
      network: targetNetworkName,
      cacheProvider: false,
      providerOptions: providerOptions,
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
    const BN = web3.utils.BN.BN;

    await this.setState({
      web3,
      BN: BN,
      provider,
      connected: true,
      address,
      chainId,
      networkId,
    });
  }

  async doApprove() {
    const web3 = this.state.web3;
    const BN = this.state.BN;
    this.setState({ txInProgress: true });
    this.state.old_token.methods
      .approve(addrMigrator, new BN(2).pow(new BN(256)).sub(new BN(1)))
      .send({ from: this.state.address })
      .on("confirmation", () => {
        this.evalStatus(this.state.address, this.state.networkId, web3);
        this.setState({ txInProgress: false });
      })
      .catch((e) => {
        console.log(e);
        this.setState({
          txInProgress: false,
          showErrorMsg: true,
          errorMsg: JSON.stringify(e),
        });
      });
  }

  async doSwap() {
    const web3 = this.state.web3;
    this.setState({ txInProgress: true });
    this.state.migrator_contract.methods
      .doSwap()
      .send({ from: this.state.address })
      .on("confirmation", () => {
        console.log("confirmation");
        this.evalStatus(this.state.address, this.state.networkId, web3);
        this.setState({ txInProgress: false });
      })
      .catch((e) => {
        console.log(e);
        this.setState({
          txInProgress: false,
          showErrorMsg: true,
          errorMsg: JSON.stringify(e),
        });
      });
  }

  async evalStatus(address, networkId, web3) {
    const BN = web3.utils.BN.BN;
    if (networkId === targetNetworkID) {
      const old_token = new web3.eth.Contract(ERC20.abi, addrStcv1);
      const new_token = new web3.eth.Contract(ERC20.abi, addrStcv2);
      const migrator_contract = new web3.eth.Contract(
        STCSwapper.abi,
        addrMigrator
      );

      const d = (
        await Promise.all([
          old_token.methods.balanceOf(address).call(),
          new_token.methods.balanceOf(address).call(),
          old_token.methods.allowance(address, addrMigrator).call(),
          web3.eth.getBalance(addrMigrator),
          migrator_contract.methods.migrationBonus().call(),
          new_token.methods.balanceOf(addrMigrator).call(),
        ])
      ).map((x) => new BN(x));
      const oldBalance = d[0];
      const newBalance = d[1];
      const oldAllowance = d[2];
      const migratorETHBalance = d[3];
      const migrationBonus = d[4];
      const migratorSTCV2Balance = d[5];

      const I10E18 = new BN(10 ** 10).mul(new BN(10 ** 8));
      const eligibleForRefund = oldBalance.gte(new BN(1000000));
      const canMigratorRefund = false; // TODO
      const canSwap = migratorSTCV2Balance.gte(
        oldBalance.mul(new BN(10 ** 10)).mul(new BN(10 ** 6))
      );
      const wasApproved = oldAllowance.gte(oldBalance);

      this.setState({
        migrator_contract,
        old_token,
        new_token,
        oldBalance,
        newBalance,
        oldAllowance,
        migratorETHBalance,
        migrationBonus,
        migratorSTCV2Balance,
        eligibleForRefund,
        canMigratorRefund,
        canSwap,
        wasApproved,
        address,
        I10E18,
      });
    }
  }

  subscribeProvider(provider) {
    if (!provider.on) {
      return;
    }
    provider.on("close", () => {
      window.location.reload(false);
    });
    provider.on("accountsChanged", async (accounts) => {
      console.log(accounts);
      const address = accounts[0];
      await this.evalStatus(address, this.state.networkId, this.state.web3);
    });
    /* TODO: Make is saner - don't reload the app... */
    provider.on("chainChanged", async () => {
      window.location.reload(false);
    });
    provider.on("networkChanged", async () => {
      window.location.reload(false);
    });
  }

  render() {
    return (
      <div className="App">
        <Modal show={this.state.showErrorMsg}>
          <Modal.Header>
            <Modal.Title>Error</Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <p>Error: {this.state.errorMsg}</p>
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="primary"
              onClick={() => {
                this.setState({ showErrorMsg: false });
              }}
            >
              OK
            </Button>
          </Modal.Footer>
        </Modal>

        <div className="wrapper">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div>
            <img src={logoSTC} className="App-logo" alt="logo" />
            <div className="App-logo-text">
              <h2>STCV2 Token migration</h2>
              {!this.state.eula ? (
                <div>
                  <div className="App-eula">
                    <ol>
                      <li>
                        {" "}
                        Only access this app if you&aposre a holder of STCV1{" "}
                      </li>
                      <li>
                        {" "}
                        NEVER send STCV1 directly to the migration contract{" "}
                      </li>
                      <li> If you disregarded 2) then contact STC support </li>
                      <li>
                        {" "}
                        You need to have ETH in your wallet in order to swap
                        STCV1 for STCV2{" "}
                      </li>
                      <li> The swap is irreversible </li>
                      <li>
                        {" "}
                        We will swap all of your STCV1 - smaller swaps are
                        disallowed{" "}
                      </li>
                      <li> We will ask you to perform 2 ETH transactions </li>
                      <li>
                        {" "}
                        When swapping more than 10k STCV1 you will receive a
                        full/partial gas refund for both transactions{" "}
                      </li>
                      <li>
                        {" "}
                        The migration bonus might be changed at any time - right
                        now the gas refund is 0.01 ETH{" "}
                      </li>
                    </ol>
                  </div>
                  <Button
                    variant="warning"
                    size="lg"
                    onClick={() => {
                      this.setState({ eula: true });
                    }}
                  >
                    I understand what I&aposm doing
                  </Button>
                </div>
              ) : !this.state.connected ? (
                <div>
                  <Button
                    variant="success"
                    size="lg"
                    onClick={this.onConnect.bind(this)}
                  >
                    Connect wallet
                  </Button>
                </div>
              ) : this.state.chainId !== targetNetworkID ? (
                <Alert variant="danger">
                  {" "}
                  Unsupported network id! Please switch to {
                    targetNetworkName
                  }{" "}
                </Alert>
              ) : (
                <div>
                  <div> Double check that you use the correct account </div>
                  <div> Connected account: {this.state.address} </div>
                  <div>
                    {" "}
                    STCV1 balance:{" "}
                    {this.state.oldBalance
                      .div(new this.state.BN(10 ** 2))
                      .toString()}{" "}
                  </div>
                  <div>
                    {" "}
                    STCV2 balance:{" "}
                    {this.state.web3.utils.fromWei(this.state.newBalance)}{" "}
                  </div>
                  <div>
                    {" "}
                    Migrators STCV1 allowance:{" "}
                    {this.state.wasApproved ? "OK" : "Insufficient"}
                  </div>
                  <div>
                    {" "}
                    STCV2 available swap supply:{" "}
                    {this.state.web3.utils.fromWei(
                      this.state.migratorSTCV2Balance
                    )}{" "}
                  </div>
                  <div>
                    ETH refund pool:{" "}
                    {this.state.web3.utils.fromWei(
                      this.state.migratorETHBalance
                    )}{" "}
                    ETH
                  </div>
                  <div>
                    Current migration bonus:{" "}
                    {this.state.web3.utils.fromWei(this.state.migrationBonus)}{" "}
                    ETH
                  </div>
                  <div>
                    {this.state.migrationBonus.isZero()
                      ? "Migration bonus was disabled by STC - subsidies ended"
                      : this.state.eligibleForRefund
                      ? "Eligible for gas refund - at the end of the migration you will receive a small ETH refund"
                      : "You're not eligible for a gas refund - you hold less than 10k STCV1"}
                  </div>

                  {this.state.oldBalance.isZero() ? (
                    <Alert variant="success">
                      You don t hold any STCV1 tokens
                    </Alert>
                  ) : !this.state.canSwap ? (
                    <Alert variant="danger">
                      {" "}
                      Migration contract has insufficient STCV2 - contact STC
                      support.{" "}
                    </Alert>
                  ) : !this.state.wasApproved ? (
                    <div>
                      {this.state.txInProgress ? (
                        <Spinner animation="border" variant="success" />
                      ) : (
                        <Button
                          variant="success"
                          size="lg"
                          onClick={this.doApprove.bind(this)}
                        >
                          Approve swap?
                        </Button>
                      )}
                    </div>
                  ) : this.state.txInProgress ? (
                    <Spinner animation="border" variant="success" />
                  ) : (
                    <Button
                      variant="success"
                      size="lg"
                      onClick={this.doSwap.bind(this)}
                    >
                      Swap STCV1 for STCV2?
                    </Button>
                  )}
                </div>
              )}
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
