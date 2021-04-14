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
import chains from "./Chains.json";

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
    this.state = {};
    this.web3Modal = new Web3Modal({
      cacheProvider: true,
      providerOptions: providerOptions,
    });
  }

  componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect()
        .then(() => {
          this.setState({ eula: true });
        })
        .catch((e) => {
          console.log(e);
          this.setState({
            txInProgress: false,
            showErrorMsg: true,
            errorMsg: JSON.stringify(e),
          });
        });
    } else {
      this.setState({ eula: false });
    }
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
      .approve(
        chains[this.state.networkId].addr_migrator,
        new BN(2).pow(new BN(256)).sub(new BN(1))
      )
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
    const config = chains[networkId];
    if (config) {
      const old_token = new web3.eth.Contract(ERC20.abi, config.addr_stcv1);
      const new_token = new web3.eth.Contract(ERC20.abi, config.addr_stcv2);
      const migrator_contract = new web3.eth.Contract(
        STCSwapper.abi,
        config.addr_migrator
      );

      const d = (
        await Promise.all([
          old_token.methods.balanceOf(address).call(),
          new_token.methods.balanceOf(address).call(),
          old_token.methods.allowance(address, config.addr_migrator).call(),
          web3.eth.getBalance(config.addr_migrator),
          migrator_contract.methods.migrationBonus().call(),
          new_token.methods.balanceOf(config.addr_migrator).call(),
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
      const canMigratorRefund =
        migratorETHBalance.gte(migrationBonus) || migrationBonus.isZero();
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
      const address = accounts[0];
      await this.evalStatus(address, this.state.networkId, this.state.web3);
    });
    provider.on("chainChanged", async () => {
      const web3 = this.state.web3;
      const networkId = await web3.eth.net.getId();
      const chainId = await web3.eth.chainId();
      this.evalStatus(this.state.address, networkId, web3).then(() => {
        this.setState({ networkId, chainId });
      });
    });
    provider.on("networkChanged", async () => {
      const web3 = this.state.web3;
      const networkId = await web3.eth.net.getId();
      const chainId = await web3.eth.chainId();
      this.evalStatus(this.state.address, networkId, web3).then(() => {
        this.setState({ networkId, chainId });
      });
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
          <div>
            <img src={logoSTC} className="App-logo" alt="logo" />
            <div className="App-logo-text">
              {this.state.eula === undefined ? (
                <Spinner animation="border" variant="success" />
              ) : !this.state.eula ? (
                <div>
                  <div className="App-eula">
                    <h2 className="App-header">
                      STC Token v1 to v2 migration app
                    </h2>
                    <p className="App-using">
                      By using the STC Token migration app, you will easily swap
                      your STC Token to the new updated version. The swap will
                      be made directly from your wallet, using the secure
                      connection.
                    </p>
                    <p className="App-token-information">
                      STC Token migration information:
                    </p>
                    <ol>
                      <li>
                        The swap will give you the same amount of STC Tokens v2
                        for all STC Tokens v1
                      </li>
                      <li>The swap is mandatory and irreversible.</li>
                      <li>
                        All of your STC v1 tokens need to be swapped - smaller
                        swaps are disallowed.
                      </li>
                      <li>
                        While swapping, you will perform two transactions and
                        pay a fee in ETH.
                      </li>
                      <li>
                        When swapping more than 10 000 STC v1, you will receive
                        a full/partial ETH gas refund for both transactions.
                      </li>
                    </ol>

                    <p className="App-code-info">
                      The code of the STC Token v1 to v2 migration app can be
                      reviewed at: &nbsp;
                      <a
                        className="App-href"
                        href="https://github.com/StudentCoinTeam/stc-token-migration"
                        target="_blank"
                        rel="noreferrer"
                      >
                        https://github.com/StudentCoinTeam/stc-token-migration
                      </a>
                    </p>

                    <button
                      className="App-button mt-2"
                      onClick={() => {
                        this.setState({ eula: true });
                      }}
                    >
                      Let&apos;s swap my tokens
                    </button>
                  </div>
                </div>
              ) : !this.state.connected ? (
                <div>
                  <button
                    className="App-button mmt-2"
                    onClick={this.onConnect.bind(this)}
                  >
                    Connect wallet
                  </button>
                </div>
              ) : !chains[this.state.chainId] ? (
                <div>
                  <div className="alert-message alert-message--error">
                    {" "}
                    Unsupported network id! Please switch to mainnet or ropsten{" "}
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      this.web3Modal.clearCachedProvider();
                      this.setState({ connected: false });
                    }}
                  >
                    Disconnect Wallet
                  </Button>{" "}
                </div>
              ) : this.state.oldBalance.isZero() ? (
                <div>
                  <Alert variant="success">
                    You don&apos;t hold any STC v1 tokens. If you&apos;ve just
                    performed a swap then STC v2 tokens were transferred to your
                    account.
                  </Alert>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      this.web3Modal.clearCachedProvider();
                      this.setState({ connected: false });
                    }}
                  >
                    Disconnect Wallet
                  </Button>{" "}
                </div>
              ) : (
                <div>
                  <div className="align-left mmt-2">
                    <p>Please check the details of the connected account:</p>
                    <div className="line-height">
                      <p>
                        {" "}
                        Connected account: {this.state.address}{" "}
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => {
                            this.web3Modal.clearCachedProvider();
                            this.setState({ connected: false });
                          }}
                        >
                          Disconnect Wallet
                        </Button>{" "}
                      </p>
                      <p>
                        Your STC v1 balance to be swapped:&nbsp;
                        {this.state.oldBalance
                          .div(new this.state.BN(10 ** 2))
                          .toString()}
                      </p>
                      <p>
                        Your STC v2 balance:&nbsp;
                        {this.state.web3.utils.fromWei(this.state.newBalance)}
                      </p>
                      <p>
                        Migrators STCV1 allowance:&nbsp;
                        {this.state.wasApproved ? "OK" : "Insufficient"}
                      </p>
                      {/* <div>
                        STC v2 available swap supply:{" "}
                        {this.state.web3.utils.fromWei(
                          this.state.migratorSTCV2Balance
                        )}
                      </div> */}
                      <p>
                        ETH refund pool:&nbsp;
                        {this.state.web3.utils.fromWei(
                          this.state.migratorETHBalance
                        )}
                        ETH
                      </p>
                      <p>
                        Current migration bonus:&nbsp;
                        {this.state.web3.utils.fromWei(
                          this.state.migrationBonus
                        )}{" "}
                        ETH
                      </p>
                    </div>
                    <div>
                      {this.state.migrationBonus.isZero()
                        ? "Migration bonus was disabled by STC - subsidies ended"
                        : this.state.eligibleForRefund
                        ? "Eligible for gas refund - at the end of the migration you will receive a small ETH refund"
                        : "You're not eligible for a gas refund - you hold less than 10k STC v1"}
                    </div>
                  </div>
                  {chains[this.state.chainId].name === "mainnet" ? null : (
                    <div className="alert-message alert-message--error">
                      You&apos;re on testnet
                    </div>
                  )}
                  {this.state.oldBalance.isZero() ? (
                    <div className="alert-message alert-message--error">
                      You don&apos;t hold any STC v1 tokens. If you&apos;ve just
                      performed a swap then STC v2 tokens were transferred to
                      your account.
                    </div>
                  ) : !this.state.canSwap ? (
                    <div className="alert-message alert-message--error">
                      {" "}
                      Migration contract has insufficient STC v2 to perform the
                      swap - contact STC support.{" "}
                    </div>
                  ) : !this.state.canMigratorRefund ? (
                    <div className="alert-message alert-message--error">
                      {" "}
                      Migration contract has insufficient ETH to subsidize the
                      swap - contact STC support.{" "}
                    </div>
                  ) : !this.state.wasApproved ? (
                    <div>
                      {this.state.txInProgress ? (
                        <Spinner animation="border" variant="success" />
                      ) : (
                        <button
                          className="App-button"
                          onClick={this.doApprove.bind(this)}
                        >
                          Approve swap?
                        </button>
                      )}
                    </div>
                  ) : this.state.txInProgress ? (
                    <Spinner animation="border" variant="success" />
                  ) : (
                    <button
                      className="App-button"
                      onClick={this.doSwap.bind(this)}
                    >
                      Swap STC v1 for STC v2?
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
