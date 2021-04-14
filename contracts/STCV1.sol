/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract STCV1 is ERC20 {
    // 2 decimals
    constructor() ERC20("Student Coin", "STC_V1") {
        _mint(_msgSender(), 10_000_000_000 * (10 ** uint256(decimals())));
    }

    function decimals() public view virtual override returns (uint8) {
        return 2;
    }
}
