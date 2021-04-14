/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract STCV2 is ERC20 {
    // 18 decimals
    constructor() ERC20("Student Coin", "STC_V2") {
        _mint(_msgSender(), 10_000_000_000 * (10 ** uint256(decimals())));
    }
}
