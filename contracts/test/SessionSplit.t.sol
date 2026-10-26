// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SessionSplit} from "../SessionSplit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ---------------------------------------------------------------------------
// Minimal MockERC20 — 6 decimals, public mint, standard ERC-20 surface
// ---------------------------------------------------------------------------
contract MockERC20 {
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply       += amount;
        balanceOf[to]     += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// Shared base — actors, constants, setUp
// ---------------------------------------------------------------------------
contract SessionSplitTestBase is Test {
    MockERC20    internal token;
    SessionSplit internal split;

    address internal sponsor  = makeAddr("sponsor");
    address internal host     = makeAddr("host");
    address internal stranger = makeAddr("stranger");

    // 6-decimal amounts (like USDC)
    uint256 internal constant HOST_PAYOUT    = 10e6;  // 10 USDC
    uint256 internal constant REWARD_BUDGET  = 50e6;  // 50 USDC
    uint256 internal constant TOTAL_DEPOSIT  = HOST_PAYOUT + REWARD_BUDGET; // 60 USDC

    // Deadline 1 hour from "now" (setUp warps to t=1000 so timestamps are sane)
    uint256 internal constant BASE_TS        = 1_000;
    uint256 internal constant DEADLINE       = BASE_TS + 3_600;

    function setUp() public virtual {
        vm.warp(BASE_TS);

        token = new MockERC20("Mock USDC", "mUSDC", 6);
        split = new SessionSplit(address(token));

        // Fund the sponsor and grant an unlimited approval to SessionSplit
        token.mint(sponsor, 1_000e6);
        vm.prank(sponsor);
        token.approve(address(split), type(uint256).max);
    }

    // Helper: creates a standard session from sponsor and returns sessionId
    function _createSession() internal returns (uint256 sessionId) {
        vm.prank(sponsor);
        sessionId = split.createSession(host, HOST_PAYOUT, REWARD_BUDGET, DEADLINE);
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract SessionSplitTest is SessionSplitTestBase {

    // -----------------------------------------------------------------------
    // 1. testSuccessfulMultiRecipientPayout
    // -----------------------------------------------------------------------
    function testSuccessfulMultiRecipientPayout() public {
        uint256 sessionId = _createSession();

        // 5 unique participants; their rewards sum to 30e6 (< REWARD_BUDGET 50e6)
        address p1 = makeAddr("p1");
        address p2 = makeAddr("p2");
        address p3 = makeAddr("p3");
        address p4 = makeAddr("p4");
        address p5 = makeAddr("p5");

        address[] memory participants = new address[](5);
        participants[0] = p1;
        participants[1] = p2;
        participants[2] = p3;
        participants[3] = p4;
        participants[4] = p5;

        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 10e6;
        amounts[1] =  8e6;
        amounts[2] =  6e6;
        amounts[3] =  4e6;
        amounts[4] =  2e6;
        // total = 30e6, leftover = 20e6 back to sponsor

        uint256 sponsorBefore  = token.balanceOf(sponsor);
        uint256 hostBefore     = token.balanceOf(host);

        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        // Host received hostPayout
        assertEq(token.balanceOf(host), hostBefore + HOST_PAYOUT, "host payout mismatch");

        // Each participant received their amount
        assertEq(token.balanceOf(p1), amounts[0], "p1 payout");
        assertEq(token.balanceOf(p2), amounts[1], "p2 payout");
        assertEq(token.balanceOf(p3), amounts[2], "p3 payout");
        assertEq(token.balanceOf(p4), amounts[3], "p4 payout");
        assertEq(token.balanceOf(p5), amounts[4], "p5 payout");

        // Sponsor receives unused budget (50 - 30 = 20 USDC) back.
        // sponsorBefore was captured AFTER createSession deducted TOTAL_DEPOSIT,
        // so we only add the leftover — not subtract again.
        uint256 totalPaid    = 30e6;
        uint256 expectedBack = REWARD_BUDGET - totalPaid;
        assertEq(
            token.balanceOf(sponsor),
            sponsorBefore + expectedBack,
            "sponsor leftover refund"
        );
    }

    // -----------------------------------------------------------------------
    // 2. testUnauthorizedSettlement
    // -----------------------------------------------------------------------
    function testUnauthorizedSettlement() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        vm.prank(stranger);
        vm.expectRevert(SessionSplit.Unauthorized.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 3. testOverpaymentRevert
    // -----------------------------------------------------------------------
    function testOverpaymentRevert() public {
        uint256 sessionId = _createSession();

        // 3 participants whose rewards exceed rewardBudget
        address p1 = makeAddr("op1");
        address p2 = makeAddr("op2");
        address p3 = makeAddr("op3");

        address[] memory participants = new address[](3);
        participants[0] = p1;
        participants[1] = p2;
        participants[2] = p3;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 20e6;
        amounts[1] = 20e6;
        amounts[2] = 15e6; // total 55e6 > REWARD_BUDGET 50e6

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.RewardBudgetExceeded.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 4. testDuplicateRecipients
    // -----------------------------------------------------------------------
    function testDuplicateRecipients() public {
        uint256 sessionId = _createSession();

        address p1 = makeAddr("dup1");

        address[] memory participants = new address[](2);
        participants[0] = p1;
        participants[1] = p1; // duplicate

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5e6;
        amounts[1] = 5e6;

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.DuplicateRecipient.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 5. testRepeatedSettlement
    // -----------------------------------------------------------------------
    function testRepeatedSettlement() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        // First settle — should succeed
        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        // Second settle — must revert with InvalidState
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidState.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 6. testPrematureRefund
    // -----------------------------------------------------------------------
    function testPrematureRefund() public {
        uint256 sessionId = _createSession();

        // Still before deadline (block.timestamp == BASE_TS < DEADLINE)
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.DeadlineNotPassed.selector);
        split.refund(sessionId);
    }

    // -----------------------------------------------------------------------
    // 7. testRefundAfterSettlement
    // -----------------------------------------------------------------------
    function testRefundAfterSettlement() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        // Settle first
        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        // Warp past deadline so the deadline check passes, but state check fires first
        vm.warp(DEADLINE + 1);

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidState.selector);
        split.refund(sessionId);
    }

    // -----------------------------------------------------------------------
    // 8. testRefundAfterDeadline
    // -----------------------------------------------------------------------
    function testRefundAfterDeadline() public {
        uint256 sessionId = _createSession();

        uint256 sponsorBefore = token.balanceOf(sponsor);

        // Warp past the deadline
        vm.warp(DEADLINE + 1);

        vm.prank(sponsor);
        split.refund(sessionId);

        // Sponsor should receive hostPayout + rewardBudget back (== TOTAL_DEPOSIT)
        assertEq(
            token.balanceOf(sponsor),
            sponsorBefore + TOTAL_DEPOSIT,
            "sponsor refund amount"
        );
    }

    // -----------------------------------------------------------------------
    // 9. testUnauthorizedRefund
    // -----------------------------------------------------------------------
    function testUnauthorizedRefund() public {
        uint256 sessionId = _createSession();

        vm.warp(DEADLINE + 1);

        vm.prank(stranger);
        vm.expectRevert(SessionSplit.Unauthorized.selector);
        split.refund(sessionId);
    }

    // -----------------------------------------------------------------------
    // 10. testDeadlinePassedSettlement
    // -----------------------------------------------------------------------
    function testDeadlinePassedSettlement() public {
        uint256 sessionId = _createSession();

        // Warp past the deadline
        vm.warp(DEADLINE + 1);

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.DeadlinePassed.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 11. testZeroParticipants
    // -----------------------------------------------------------------------
    function testZeroParticipants() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        uint256 sponsorBefore = token.balanceOf(sponsor);
        uint256 hostBefore    = token.balanceOf(host);

        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        // Host still receives hostPayout
        assertEq(token.balanceOf(host), hostBefore + HOST_PAYOUT, "host payout");

        // Sponsor gets the full rewardBudget back (no participants to pay).
        // sponsorBefore was captured AFTER createSession deducted TOTAL_DEPOSIT,
        // so we only add the returned budget — not subtract again.
        assertEq(
            token.balanceOf(sponsor),
            sponsorBefore + REWARD_BUDGET,
            "sponsor full budget refund"
        );
    }

    // -----------------------------------------------------------------------
    // 12. testLengthMismatch
    // -----------------------------------------------------------------------
    function testLengthMismatch() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](2);
        participants[0] = makeAddr("lm1");
        participants[1] = makeAddr("lm2");

        uint256[] memory amounts = new uint256[](1); // mismatched length
        amounts[0] = 5e6;

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.LengthMismatch.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 13. testTooManyParticipants
    // -----------------------------------------------------------------------
    function testTooManyParticipants() public {
        uint256 sessionId = _createSession();

        // 6 participants — exceeds the max of 5
        address[] memory participants = new address[](6);
        participants[0] = makeAddr("tmp0");
        participants[1] = makeAddr("tmp1");
        participants[2] = makeAddr("tmp2");
        participants[3] = makeAddr("tmp3");
        participants[4] = makeAddr("tmp4");
        participants[5] = makeAddr("tmp5");

        uint256[] memory amounts = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) {
            amounts[i] = 1e6;
        }

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.TooManyParticipants.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // 14. testZeroHostAddress
    // -----------------------------------------------------------------------
    function testZeroHostAddress() public {
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.ZeroAddress.selector);
        split.createSession(address(0), HOST_PAYOUT, REWARD_BUDGET, DEADLINE);
    }

    // -----------------------------------------------------------------------
    // 15. testZeroHostPayout
    // -----------------------------------------------------------------------
    function testZeroHostPayout() public {
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidAmount.selector);
        split.createSession(host, 0, REWARD_BUDGET, DEADLINE);
    }

    // -----------------------------------------------------------------------
    // 16. testPastDeadline
    // -----------------------------------------------------------------------
    function testPastDeadline() public {
        // deadline == block.timestamp (not strictly greater) → InvalidDeadline
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidDeadline.selector);
        split.createSession(host, HOST_PAYOUT, REWARD_BUDGET, block.timestamp);
    }
}
