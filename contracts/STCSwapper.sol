/* SPDX-License-Identifier: MIT
    One way swapper from STCV1 to STCV2
    Swaps larger than 10k STC are partially subsidized by covering the TX fee by the contract
    STCV1: 0xb8B7791b1A445FB1e202683a0a329504772e0E52 Decimals: 2
    STCV2: 0x15b543e986b8c34074dfc9901136d9355a537e7e Decimals: 18
*/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract STCSwapper is Ownable {
    ERC20 private _stc_v1;
    ERC20 private _stc_v2;
    /* Migration bonus in wei */
    uint256 private _migration_bonus;

    constructor(address stc_v1, address stc_v2, uint256 migration_bonus) {
        _stc_v1 = ERC20(stc_v1);
        _stc_v2 = ERC20(stc_v2);
        _migration_bonus = migration_bonus;
        require(_stc_v1.decimals() == 2, "STCSwapper: invalid address of STC V1");
        require(_stc_v2.decimals() == 18, "STCSwapper: invalid address of STC V2");
    }

    function doSwap() public {
        address sender = _msgSender();
        uint256 balance = _stc_v1.balanceOf(sender);
        require(balance > 0, "STCSwapper: caller doesn't hold STCV1");
        bool eligibleForRefund = _migration_bonus > 0 && balance >= 1000000;
        /* Fail early if we're unable to give a gas refund */
        if (eligibleForRefund) require(address(this).balance >= _migration_bonus, "STCSwapper: Insufficient ETH for granting a gas refund");

        /* Perform the token swap */
        require(_stc_v1.transferFrom(sender, address(this), balance), "STCSwapper: failed transferFrom");
        require(_stc_v2.transfer(sender, balance*(10**16)), "STCSwapper: failed transfer");

        /* Grant a gas refund for a successful swap */
        if (eligibleForRefund) {
            (bool sent,) = sender.call{value: _migration_bonus}("");
            require(sent, "STCSwapper: Failed to grant gas refund");
        }
    }

    function migrationBonus() public view returns (uint256) {
        return _migration_bonus;
    }

    function setMigrationBonus(uint256 migration_bonus) public onlyOwner {
        _migration_bonus = migration_bonus;
    }

    /* Sends all ETH and unmigrated STCV2 to owner, STCV1 is locked forever */
    function closeMigration() public onlyOwner {
        address sender = _msgSender();
        setMigrationBonus(0);
        (bool sent,) = sender.call{value: address(this).balance}("");
        require(sent, "STCSwapper: Failed to drain ETH from contract");
        require(_stc_v2.transfer(sender, _stc_v2.balanceOf(address(this))), "STCSwapper: Failed to send all STCV2 to owner");
    }

    /* Accept ETH deposits */
    receive() external payable {}
    fallback() external payable {}
}
