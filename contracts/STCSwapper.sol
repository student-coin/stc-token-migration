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
        require(_stc_v1.transferFrom(sender, address(this), balance), "STCSwapper failed transferFrom");
        _stc_v2.transfer(sender, balance*(10**16));
        /* The UI warns the user when this condition doesn't hold */
        if (balance >= 1000000 && address(this).balance >= _migration_bonus)
            /* It's OK for this to fail */
            sender.call{value: _migration_bonus}("");
    }

    function migrationBonus() public view returns (uint256) {
        return _migration_bonus;
    }

    function setMigrationBonus(uint256 migration_bonus) public onlyOwner {
        _migration_bonus = migration_bonus;
    }
}
