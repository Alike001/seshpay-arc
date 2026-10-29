// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SessionSplit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SessionState {
        OPEN,
        SETTLED,
        REFUNDED
    }

    struct Session {
        address sponsor;
        address host;
        uint256 hostPayout;
        uint256 rewardBudget;
        uint256 deadline;
        SessionState state;
    }

    error ZeroAddress();
    error ContractAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error Unauthorized();
    error InvalidState();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error LengthMismatch();
    error TooManyParticipants();
    error DuplicateRecipient();
    error RewardBudgetExceeded();

    event SessionCreated(
        uint256 indexed sessionId,
        address indexed sponsor,
        address indexed host,
        uint256 hostPayout,
        uint256 rewardBudget,
        uint256 deadline
    );
    event SessionSettled(
        uint256 indexed sessionId,
        address host,
        uint256 hostPayout,
        uint256 totalParticipantRewards,
        uint256 refundedToSponsor
    );
    event ParticipantPaid(uint256 indexed sessionId, address indexed participant, uint256 amount);
    event SessionRefunded(uint256 indexed sessionId, address indexed sponsor, uint256 totalRefund);

    IERC20 public immutable usdc;
    uint256 public nextSessionId;
    mapping(uint256 => Session) public sessions;

    constructor(address usdcAddress) {
        if (usdcAddress == address(0)) revert ZeroAddress();

        usdc = IERC20(usdcAddress);
        nextSessionId = 1;
    }

    function createSession(
        address host,
        uint256 hostPayout,
        uint256 rewardBudget,
        uint256 deadline
    ) external returns (uint256 sessionId) {
        if (host == address(0)) revert ZeroAddress();
        if (host == address(this)) revert ContractAddress();
        if (hostPayout == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        sessionId = nextSessionId;
        nextSessionId = sessionId + 1;

        sessions[sessionId] = Session({
            sponsor: msg.sender,
            host: host,
            hostPayout: hostPayout,
            rewardBudget: rewardBudget,
            deadline: deadline,
            state: SessionState.OPEN
        });

        uint256 totalDeposit = hostPayout + rewardBudget;
        usdc.safeTransferFrom(msg.sender, address(this), totalDeposit);

        emit SessionCreated(sessionId, msg.sender, host, hostPayout, rewardBudget, deadline);
    }

    function settle(
        uint256 sessionId,
        address[] calldata participants,
        uint256[] calldata amounts
    ) external nonReentrant {
        Session storage session = sessions[sessionId];

        if (msg.sender != session.sponsor) revert Unauthorized();
        if (session.state != SessionState.OPEN) revert InvalidState();
        if (block.timestamp > session.deadline) revert DeadlinePassed();
        if (participants.length != amounts.length) revert LengthMismatch();
        if (participants.length > 5) revert TooManyParticipants();

        for (uint256 i = 0; i < participants.length; ++i) {
            if (participants[i] == address(0)) revert ZeroAddress();
            if (participants[i] == address(this)) revert ContractAddress();
            for (uint256 j = i + 1; j < participants.length; ++j) {
                if (participants[i] == participants[j]) revert DuplicateRecipient();
            }
        }

        uint256 totalParticipantRewards = 0;
        for (uint256 i = 0; i < amounts.length; ++i) {
            totalParticipantRewards += amounts[i];
        }
        if (totalParticipantRewards > session.rewardBudget) revert RewardBudgetExceeded();

        session.state = SessionState.SETTLED;

        usdc.safeTransfer(session.host, session.hostPayout);

        for (uint256 i = 0; i < participants.length; ++i) {
            usdc.safeTransfer(participants[i], amounts[i]);
            emit ParticipantPaid(sessionId, participants[i], amounts[i]);
        }

        uint256 refundedToSponsor = session.rewardBudget - totalParticipantRewards;
        if (refundedToSponsor > 0) {
            usdc.safeTransfer(session.sponsor, refundedToSponsor);
        }

        emit SessionSettled(
            sessionId,
            session.host,
            session.hostPayout,
            totalParticipantRewards,
            refundedToSponsor
        );
    }

    function refund(uint256 sessionId) external nonReentrant {
        Session storage session = sessions[sessionId];

        if (msg.sender != session.sponsor) revert Unauthorized();
        if (session.state != SessionState.OPEN) revert InvalidState();
        if (block.timestamp <= session.deadline) revert DeadlineNotPassed();

        session.state = SessionState.REFUNDED;

        uint256 totalRefund = session.hostPayout + session.rewardBudget;
        usdc.safeTransfer(session.sponsor, totalRefund);

        emit SessionRefunded(sessionId, session.sponsor, totalRefund);
    }
}
