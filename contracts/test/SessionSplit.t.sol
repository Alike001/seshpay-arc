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

// ---------------------------------------------------------------------------
// Security-hardening tests — new checks added in this PR
// All 16 original tests above are preserved unchanged.
// ---------------------------------------------------------------------------
contract SessionSplitHardeningTest is SessionSplitTestBase {

    // -----------------------------------------------------------------------
    // H-1. testZeroAddressConstructor
    //      Constructing with address(0) as the USDC token must revert.
    // -----------------------------------------------------------------------
    function testZeroAddressConstructor() public {
        vm.expectRevert(SessionSplit.ZeroAddress.selector);
        new SessionSplit(address(0));
    }

    // -----------------------------------------------------------------------
    // H-2. testContractAsHost
    //      Setting the contract itself as the host must revert with
    //      ContractAddress(). Without this guard the contract would transfer
    //      hostPayout to itself, permanently locking those funds.
    // -----------------------------------------------------------------------
    function testContractAsHost() public {
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.ContractAddress.selector);
        split.createSession(address(split), HOST_PAYOUT, REWARD_BUDGET, DEADLINE);
    }

    // -----------------------------------------------------------------------
    // H-3. testContractAsParticipant
    //      Passing the contract as a contributor address must revert with
    //      ContractAddress(). Same fund-lock risk as H-2 but in settle().
    // -----------------------------------------------------------------------
    function testContractAsParticipant() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](1);
        participants[0] = address(split); // ← the contract itself

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e6;

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.ContractAddress.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // H-4. testZeroAddressParticipant
    //      address(0) as a contributor was already guarded; confirm the
    //      error is ZeroAddress, not some other revert.
    // -----------------------------------------------------------------------
    function testZeroAddressParticipant() public {
        uint256 sessionId = _createSession();

        address[] memory participants = new address[](1);
        participants[0] = address(0);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e6;

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.ZeroAddress.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // H-5. testRepeatedRefund
    //      Calling refund twice on the same session must revert the second
    //      time with InvalidState (state is already REFUNDED).
    // -----------------------------------------------------------------------
    function testRepeatedRefund() public {
        uint256 sessionId = _createSession();
        vm.warp(DEADLINE + 1);

        vm.prank(sponsor);
        split.refund(sessionId);

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidState.selector);
        split.refund(sessionId);
    }

    // -----------------------------------------------------------------------
    // H-6. testSettleAfterRefund
    //      After a successful refund, settle must revert with InvalidState.
    // -----------------------------------------------------------------------
    function testSettleAfterRefund() public {
        uint256 sessionId = _createSession();
        vm.warp(DEADLINE + 1);

        vm.prank(sponsor);
        split.refund(sessionId);

        // Re-mint and approve so the sponsor has enough balance if the
        // contract tried to pull funds (it should not get that far).
        token.mint(sponsor, TOTAL_DEPOSIT);
        vm.prank(sponsor);
        token.approve(address(split), type(uint256).max);

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.InvalidState.selector);
        split.settle(sessionId, participants, amounts);
    }

    // -----------------------------------------------------------------------
    // H-7. testExactDeadlineBoundary
    //      At block.timestamp == deadline exactly:
    //        - settle must SUCCEED (contract uses strict-greater check)
    //        - refund must REVERT with DeadlineNotPassed
    // -----------------------------------------------------------------------
    function testExactDeadlineBoundarySettle() public {
        uint256 sessionId = _createSession();
        vm.warp(DEADLINE); // exactly at the deadline

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        // settle: block.timestamp > deadline is false when equal → should succeed
        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        (,,,,,SessionSplit.SessionState stateAfter) = split.sessions(sessionId);
        assertEq(uint8(stateAfter), uint8(SessionSplit.SessionState.SETTLED));
    }

    function testExactDeadlineBoundaryRefund() public {
        uint256 sessionId = _createSession();
        vm.warp(DEADLINE); // exactly at the deadline

        // refund: block.timestamp <= deadline is true when equal → must revert
        vm.prank(sponsor);
        vm.expectRevert(SessionSplit.DeadlineNotPassed.selector);
        split.refund(sessionId);
    }

    // -----------------------------------------------------------------------
    // H-8. testZeroRewardBudget
    //      Creating a session with rewardBudget == 0 is valid (host-only
    //      event). Settlement with no participants must pay the host and
    //      return zero to the sponsor without reverting.
    // -----------------------------------------------------------------------
    function testZeroRewardBudget() public {
        vm.prank(sponsor);
        uint256 sessionId = split.createSession(host, HOST_PAYOUT, 0, DEADLINE);

        uint256 hostBefore    = token.balanceOf(host);
        uint256 sponsorBefore = token.balanceOf(sponsor);

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        assertEq(token.balanceOf(host), hostBefore + HOST_PAYOUT, "host payout");
        // refundedToSponsor == 0, so sponsor balance unchanged
        assertEq(token.balanceOf(sponsor), sponsorBefore, "sponsor unchanged");
    }

    // -----------------------------------------------------------------------
    // H-9. testTransferFailureRollback
    //      If MockERC20.transfer reverts mid-settlement, the entire tx
    //      reverts and the contract balance is unchanged (atomicity test).
    //      We simulate this by draining the contract's USDC balance after
    //      createSession so the first safeTransfer (host payout) fails.
    // -----------------------------------------------------------------------
    function testTransferFailureRollback() public {
        uint256 sessionId = _createSession();

        // Drain the contract's token balance so the host transfer will fail
        // We do this by directly manipulating MockERC20 storage.
        // MockERC20 has a public balanceOf mapping — use vm.store.
        // Slot for balanceOf[address(split)]:
        //   mapping at slot 3 (name=0, symbol=1, decimals=2, totalSupply=3... wait, check)
        // Actually easier: have someone transfer the contract's balance out.
        // The cleanest approach: use a "draining" sponsor — create another
        // session from a different sponsor so the balance is theirs, then
        // check our session's settle fails when the contract has 0 extra.

        // Simpler: use vm.mockCall to make the token's transfer() return false.
        // safeTransfer uses SafeERC20 which checks the return value and reverts.
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(token.transfer.selector, host, HOST_PAYOUT),
            abi.encode(false) // simulate a failed transfer
        );

        address[] memory participants = new address[](0);
        uint256[] memory amounts      = new uint256[](0);

        vm.prank(sponsor);
        vm.expectRevert(); // SafeERC20 wraps the false return as a revert
        split.settle(sessionId, participants, amounts);

        vm.clearMockedCalls();

        // State must still be OPEN — the revert rolled everything back
        (,,,,,SessionSplit.SessionState stateStillOpen) = split.sessions(sessionId);
        assertEq(uint8(stateStillOpen), uint8(SessionSplit.SessionState.OPEN));
    }

    // -----------------------------------------------------------------------
    // H-10. testAccountingInvariant (fuzz)
    //       For any valid (hostPayout, rewardBudget, participantCount,
    //       amounts[]) combination, funds-in == funds-out exactly.
    // -----------------------------------------------------------------------
    function testAccountingInvariantFuzz(
        uint64 rawHostPayout,
        uint64 rawBudget,
        uint8  rawCount
    ) public {
        // Bound inputs to sane ranges
        uint256 hp     = bound(uint256(rawHostPayout), 1, 1_000_000e6);
        uint256 budget = bound(uint256(rawBudget),     0, 1_000_000e6);
        uint256 count  = bound(uint256(rawCount),      0, 5);

        // Ensure sponsor has enough balance
        token.mint(sponsor, hp + budget);
        vm.prank(sponsor);
        token.approve(address(split), type(uint256).max);

        vm.prank(sponsor);
        uint256 sessionId = split.createSession(host, hp, budget, DEADLINE);

        // Build participant amounts that don't exceed budget
        address[] memory participants = new address[](count);
        uint256[] memory amounts      = new uint256[](count);
        uint256 remaining = budget;
        for (uint256 i = 0; i < count; ++i) {
            participants[i] = makeAddr(string(abi.encodePacked("fuzz", i)));
            uint256 amt = count > 0 ? remaining / (count - i) : 0;
            amounts[i]  = amt;
            remaining  -= amt;
        }

        uint256 contractBefore = token.balanceOf(address(split));
        uint256 hostBefore     = token.balanceOf(host);
        uint256 sponsorBefore  = token.balanceOf(sponsor);

        vm.prank(sponsor);
        split.settle(sessionId, participants, amounts);

        // Contract balance decreased by exactly totalDeposit
        uint256 totalDeposit = hp + budget;
        assertEq(
            token.balanceOf(address(split)),
            contractBefore - totalDeposit,
            "contract balance"
        );

        // Host received exactly hostPayout
        assertEq(token.balanceOf(host), hostBefore + hp, "host payout");

        // All participant amounts sum correctly
        uint256 totalPaid = 0;
        for (uint256 i = 0; i < count; ++i) {
            assertEq(token.balanceOf(participants[i]), amounts[i], "participant payout");
            totalPaid += amounts[i];
        }

        // Sponsor received unused budget back
        uint256 expectedBack = budget - totalPaid;
        assertEq(token.balanceOf(sponsor), sponsorBefore + expectedBack, "sponsor refund");
    }
}
