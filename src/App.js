import React, { Component } from 'react'
import Alert from 'react-bootstrap/Alert'

import Web3 from 'web3'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'

import ERC20 from '@openzeppelin/contracts/build/contracts/ERC20.json'
import STCSwapper from './abi/STCSwapper.json'

import './App.css'
import logoSTC from './logoSTC.svg'

const SUPPORTED_NETWORK = 3
const NETWORKS = { 1: 'mainnet', 3: 'ropsten' }
const STCV1ADDR = {
    1: '0xb8B7791b1A445FB1e202683a0a329504772e0E52',
    3: '0x2C62E18C667a8794eA7F0A139F1Ab36A4e696286',
}
const STCV2ADDR = {
    1: '0x15b543e986b8c34074dfc9901136d9355a537e7e',
    3: '0x86DC1b4B59E5FA81Ec679B8F108F9b131C60D28A',
}
const MIGRATORADDR = {
    1: 'mainnet',
    3: '0xd9bdF7ace5d3b7CE9c0cf5f9CB2E620ea088dDCF',
}

function initWeb3(provider) {
    const web3 = new Web3(provider)

    web3.eth.extend({
        methods: [
            {
                name: 'chainId',
                call: 'eth_chainId',
                outputFormatter: web3.utils.hexToNumber,
            },
        ],
    })

    return web3
}

const providerOptions = {
    walletconnect: {
        package: WalletConnectProvider,
        options: {
            infuraId: '6a994151aa4a42fb89d772c6f1f00db7',
        },
    },
}

class App extends Component {
    constructor(props) {
        super(props)
        this.state = { eula: false }
        this.web3Modal = new Web3Modal({
            network: NETWORKS[SUPPORTED_NETWORK],
            cacheProvider: false,
            providerOptions: providerOptions,
        })
    }

    async onConnect() {
        const provider = await this.web3Modal.connect()

        await this.subscribeProvider(provider)

        const web3 = initWeb3(provider)

        const accounts = await web3.eth.getAccounts()

        const address = accounts[0]

        const networkId = await web3.eth.net.getId()

        const chainId = await web3.eth.chainId()

        await this.evalStatus(address, networkId, web3)
        const BN = web3.utils.BN.BN

        await this.setState({
            web3,
            BN: BN,
            provider,
            connected: true,
            address,
            chainId,
            networkId,
        })
    }

    async doApprove() {
        const web3 = this.state.web3
        const BN = this.state.BN
        this.state.old_token.methods
            .approve(
                MIGRATORADDR[SUPPORTED_NETWORK],
                new BN(2).pow(new BN(256)).sub(new BN(1))
            )
            .send({ from: this.state.address })
            .on('receipt', () => {
                this.evalStatus(this.state.address, this.state.networkID, web3)
            })
            .on('confirmation', () => {
                this.evalStatus(this.state.address, this.state.networkID, web3)
            })
    }

    async doSwap() {
        const web3 = this.state.web3
        this.state.migrator_contract.methods
            .doSwap()
            .send({ from: this.state.address })
            .on('receipt', () => {
                this.evalStatus(this.state.address, this.state.networkID, web3)
            })
            .on('confirmation', () => {
                this.evalStatus(this.state.address, this.state.networkID, web3)
            })
    }

    async evalStatus(address, networkId, web3) {
        const BN = web3.utils.BN.BN
        if (networkId === SUPPORTED_NETWORK) {
            const old_token = new web3.eth.Contract(
                ERC20.abi,
                STCV1ADDR[SUPPORTED_NETWORK]
            )
            const new_token = new web3.eth.Contract(
                ERC20.abi,
                STCV2ADDR[SUPPORTED_NETWORK]
            )
            const migrator_contract = new web3.eth.Contract(
                STCSwapper.abi,
                MIGRATORADDR[SUPPORTED_NETWORK]
            )
            const oldBalance = new BN(
                await old_token.methods.balanceOf(address).call()
            )
            const oldAllowance = new BN(
                await old_token.methods
                    .allowance(address, MIGRATORADDR[SUPPORTED_NETWORK])
                    .call()
            )

            const migratorETHBalance = await web3.eth.getBalance(
                MIGRATORADDR[SUPPORTED_NETWORK]
            )
            const migratorSTCV2Balance = new BN(
                await new_token.methods
                    .balanceOf(MIGRATORADDR[SUPPORTED_NETWORK])
                    .call()
            )
            const eligibleForRefund = oldBalance.gte(new BN(1000000))
            const canMigratorRefund = false // TODO
            const canSwap = migratorSTCV2Balance.gte(
                oldBalance.mul(new BN(10 ** 10)).mul(new BN(10 ** 6))
            )
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
                wasApproved,
            })
        }
    }

    subscribeProvider(provider) {
        if (!provider.on) {
            return
        }
        /* TODO: Make is saner - don't reload the app... */
        provider.on('close', () => {
            window.location.reload(false)
        })
        provider.on('accountsChanged', async () => {
            window.location.reload(false)
        })
        provider.on('chainChanged', async () => {
            window.location.reload(false)
        })

        provider.on('networkChanged', async () => {
            window.location.reload(false)
        })
    }

    render() {
        return (
            <div className="App">
                <div className="wrapper">
                    <div>
                        <img src={logoSTC} className="App-logo" alt="logo" />
                        <div className="App-logo-text">
                            {!this.state.eula ? (
                                <div className="App-eula">
                                    <h2 className="App-header">
                                        STC Token v1 to v2 migration app
                                    </h2>
                                    <p className="App-using">
                                        By using the STC Token migration app,
                                        you will easily swap your STC Token to
                                        the new updated version. The swap will
                                        be made directly from your wallet, using
                                        the secure connection.
                                    </p>
                                    <p className="App-token-information">
                                        STC Token migration information:
                                    </p>
                                    <ol>
                                        <li>
                                            The swap will give you the same
                                            amount of STC Tokens v2 for all STC
                                            Tokens v1
                                        </li>
                                        <li>
                                            The swap is mandatory and
                                            irreversible.
                                        </li>
                                        <li>
                                            All of your STC v1 tokens need to be
                                            swapped - smaller swaps are
                                            disallowed.
                                        </li>
                                        <li>
                                            While swapping, you will perform two
                                            transactions and pay a fee in ETH.
                                        </li>
                                        <li>
                                            When swapping more than 10 000 STC
                                            v1, you will receive a full/partial
                                            ETH gas refund for both
                                            transactions.
                                        </li>
                                    </ol>
                                    <p className="App-code-info">
                                        The code of the STC Token v1 to v2
                                        migration app could be reviewed at:
                                        &nbsp;
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
                                            this.setState({ eula: true })
                                        }}
                                    >
                                        Let&apos;s swap my tokens
                                    </button>
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
                            ) : this.state.chainId !== SUPPORTED_NETWORK ? (
                                <Alert variant="danger">
                                    {' '}
                                    Unsupported network id! Please switch to{' '}
                                    {NETWORKS[SUPPORTED_NETWORK]}{' '}
                                </Alert>
                            ) : this.state.oldBalance.isZero() ? (
                                <Alert variant="success">
                                    {' '}
                                    You don&apost hold any STC v1 tokens{' '}
                                </Alert>
                            ) : (
                                <div>
                                    <div className="align-left mmt-2">
                                        <p>
                                            Please check the details of the
                                            connected account:
                                        </p>
                                        <div className="line-height">
                                            <p>
                                                Connected account:{' '}
                                                {this.state.address}
                                            </p>
                                            <p>
                                                Your STC v1 balance to be
                                                swapped: &nbsp;
                                                {this.state.oldBalance
                                                    .div(
                                                        new this.state.BN(
                                                            10 ** 2
                                                        )
                                                    )
                                                    .toString()}{' '}
                                            </p>
                                            <p>
                                                Your STC v2 balance:&nbsp;
                                                {this.state.web3.utils.fromWei(
                                                    this.state.newBalance
                                                )}
                                            </p>
                                            <p>
                                                Migrators STC v1 allowance:
                                                &nbsp;
                                                {this.state.oldAllowance
                                                    .div(
                                                        new this.state.BN(
                                                            10 ** 2
                                                        )
                                                    )
                                                    .toString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div>
                                        {' '}
                                        {this.state.eligibleForRefund
                                            ? 'Eligible for gas refund - at the end of the migration you will receive a small ETH refund'
                                            : "You're not eligible for a gas refund - you hold less than 10k STC v1"}{' '}
                                    </div>

                                    {!this.state.canSwap ? (
                                        <Alert variant="danger">
                                            {' '}
                                            Migration contract has insufficient
                                            STC v2 - contact STC support.{' '}
                                        </Alert>
                                    ) : !this.state.wasApproved ? (
                                        <div>
                                            <button
                                                className="App-button mmt-2"
                                                onClick={this.doApprove.bind(
                                                    this
                                                )}
                                            >
                                                Complete swap
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="App-button mmt-2"
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
        )
    }
}

export default App
