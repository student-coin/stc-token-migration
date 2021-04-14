const { expect } = require('chai')

const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const STCV1 = artifacts.require('STCV1')
const STCV2 = artifacts.require('STCV2')
const STCSwapper = artifacts.require('STCSwapper')

contract('Migration', accounts => {
  beforeEach(async function () {
    this.token1 = await STCV1.new()
    this.token2 = await STCV2.new()
    this.E2 = "0".repeat(2)
    this.E16 = "0".repeat(16)
    this.E15 = "0".repeat(15)
    this.E18 = "0".repeat(18)
  });

  it('Deployment - failing', async function () {
    await expectRevert(STCSwapper.new(this.token2.address, this.token1.address, 0, accounts[0]), 'STCSwapper: invalid address of STC V1')
    await expectRevert(STCSwapper.new(this.token1.address, this.token1.address, 0, accounts[0]), 'STCSwapper: invalid address of STC V2')
    await expectRevert(STCSwapper.new(this.token1.address, this.token2.address, 0, constants.ZERO_ADDRESS), 'Ownable: new owner is the zero address.')
  });

  it('Deployment - OK', async function () {
    const swap = await STCSwapper.new(this.token1.address, this.token2.address, 0, accounts[0]);
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("0");
    expect(await swap.owner())
      .to.be.equal(accounts[0]);
  });

  it('Deployment - Delegate Owner', async function () {
    const swap = await STCSwapper.new(this.token1.address, this.token2.address, 1337, accounts[1]);
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("1337");
    expect(await swap.owner())
      .to.be.equal(accounts[1]);
  });

  it('Only owner controls the migration bonus and may close the migration', async function () {
    const swap = await STCSwapper.new(this.token1.address, this.token2.address, 0, accounts[0]);
    await swap.setMigrationBonus("1337")
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("1337");
    await expectRevert(swap.setMigrationBonus("0", { from: accounts[1] }), "Ownable: caller is not the owner.")
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("1337");
    await expectRevert(swap.closeMigration({ from: accounts[1] }), "Ownable: caller is not the owner.")
    await swap.closeMigration()
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("0");
  });

  it('Swaps', async function () {
    const swap = await STCSwapper.new(this.token1.address, this.token2.address, "1" + this.E16, accounts[0]);
    await this.token2.transfer(swap.address, "100000" + this.E18) // Send 100k STCV2 to swapper
    await this.token1.transfer(accounts[1], "999999") // Send 9999.99 STCV1 to Alice
    expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("0");
    expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("999999");
    // Case1 - Swap without allowance
    await expectRevert(swap.doSwap({ from: accounts[1] }), "ERC20: transfer amount exceeds allowance.")
    // Now Alice approves swapping
    await this.token1.approve(swap.address, constants.MAX_UINT256, { from: accounts[1] })
    // Case2 - Swap bellow the refund threshold
    await swap.doSwap({ from: accounts[1] })
    // Time to check whether the swap worked
    expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("0");
    expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("999999" + this.E16);
    // Great :) As we never sent ether to Swapper then we will fail on the subsidy
    await this.token1.transfer(accounts[1], "10000" + this.E2) // Send 10k STCV1 to Alice
    // Case3 = Swap above refund threshold - no ETH present in the contract
    await expectRevert(swap.doSwap({ from: accounts[1] }), "STCSwapper: Insufficient ETH for granting a gas refund.")
    // Now fund the contract to grant this subsidy - anyone can fund the contract
    await swap.send("5" + this.E15, {from: accounts[1]})
    await swap.send("5" + this.E15, {from: accounts[0]})
    expect(await web3.eth.getBalance(swap.address)).to.be.bignumber.equal("1" + this.E16, accounts[1]);
    // Case4 = Swap above refund threshold - no funds present
    await swap.doSwap({ from: accounts[1] })
    expect(await web3.eth.getBalance(swap.address)).to.be.bignumber.equal("0");
    // Case5 - Swap above available liquidity
    await swap.send("1" + this.E16, {from: accounts[0]})
    await this.token1.transfer(accounts[1], "100000" + this.E2) // Send 100k STCV1 to Alice
    await expectRevert(swap.doSwap({ from: accounts[1] }), "ERC20: transfer amount exceeds balance.")
    // Case 6 - Draining by owner
    await swap.send("1" + this.E16, {from: accounts[0]})
    await swap.closeMigration()
    expect(await swap.migrationBonus())
      .to.be.bignumber.equal("0");
    expect(await this.token2.balanceOf(swap.address)).to.be.bignumber.equal("0");
    // DRAINING NEVER RETRIEVES STCV1
    expect(await this.token1.balanceOf(swap.address)).to.be.bignumber.equal("1999999");
    // Case 7 - STCV1 donation after closing. WARNING: ETH might still be sent but only the owner might reenable migration bonusses
    await this.token2.transfer(swap.address, "200000" + this.E18) // Send 200k STCV2 to swapper
    await swap.doSwap({ from: accounts[1] })
    expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("0");
    expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("11999999" + this.E16);
    // Case 8 - owner reenables migration bonus
    await swap.setMigrationBonus("1" + this.E16, { from: accounts[0] })
    await this.token1.transfer(accounts[1], "10000" + this.E2) // Send 10k STCV1 to Alice
    await expectRevert(swap.doSwap({ from: accounts[1] }), "STCSwapper: Insufficient ETH for granting a gas refund.")
    await swap.send("1" + this.E16, {from: accounts[0]})
    await swap.doSwap({ from: accounts[1] })
  });

  it('Refund pricing - OPTION1', async function() {
      const swap = await STCSwapper.new(this.token1.address, this.token2.address, "1" + this.E16, accounts[0]);
      await this.token2.transfer(swap.address, "100000" + this.E18) // Send 100k STCV2 to swapper
      await this.token1.transfer(accounts[1], "50000" + this.E2) // Send 50k STCV1 to Alice
      expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("50000" + this.E2);
      expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("0");
      await swap.send("1" + this.E16, {from: accounts[0]})

      const {receipt: {cumulativeGasUsed: g1}} = await this.token1.approve(swap.address, constants.MAX_UINT256, { from: accounts[1] })
      const {receipt: {cumulativeGasUsed: g2}} = await swap.doSwap({ from: accounts[1] })

      expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("0");
      expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("50000" + this.E18);

      console.log("[OPTION1] Approve + Swap usses up " + (g1 + g2) + " gas")
  });

  it('Refund pricing - OPTION2', async function() {
      const swap = await STCSwapper.new(this.token1.address, this.token2.address, "1" + this.E16, accounts[0]);
      await this.token2.transfer(swap.address, "100000" + this.E18) // Send 100k STCV2 to swapper
      await this.token1.transfer(accounts[1], "50000" + this.E2) // Send 50k STCV1 to Alice
      expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("50000" + this.E2);
      expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("0");
      await swap.send("1" + this.E16, {from: accounts[0]})

      const {receipt: {cumulativeGasUsed: g1}} = await this.token1.approve(swap.address, "50000" + this.E2, { from: accounts[1] })
      const {receipt: {cumulativeGasUsed: g2}} = await swap.doSwap({ from: accounts[1] })

      expect(await this.token1.balanceOf(accounts[1])).to.be.bignumber.equal("0");
      expect(await this.token2.balanceOf(accounts[1])).to.be.bignumber.equal("50000" + this.E18);

      console.log("[OPTION2] Approve + Swap usses up " + (g1 + g2) + " gas")
  });

});
