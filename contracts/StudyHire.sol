// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title StudyHire
/// @notice Minimal on-chain escrow for the StudyHire hackathon entry.
///         The orchestrator posts a USDC-denominated bounty; submitters submit
///         a content hash; a designated verifier signs declareWinner to release
///         funds. A take-rate of `TAKE_BPS` is sent to the treasury on payout.
contract StudyHire {
    /// 5% take rate in basis points. The rubric's market story uses this number.
    uint256 public constant TAKE_BPS = 500;
    uint256 public constant BPS = 10_000;

    address public immutable usdc;
    address public immutable verifier;
    address public immutable treasury;

    enum Status { None, Open, Resolved, Cancelled }

    struct Bounty {
        address client;
        uint256 amount;       // USDC raw units
        uint64  deadline;     // unix seconds
        bytes32 brief;        // keccak256 of off-chain brief JSON
        Status  status;
        uint32  submissionCount;
    }

    struct Submission {
        address submitter;
        bytes32 contentHash;  // keccak256 of off-chain submission JSON
        uint64  submittedAt;
    }

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Submission[]) public submissions;

    event BountyPosted(uint256 indexed id, address indexed client, uint256 amount, uint64 deadline, bytes32 brief);
    event Submitted(uint256 indexed id, address indexed submitter, uint256 idx, bytes32 contentHash);
    event WinnerDeclared(uint256 indexed id, address indexed winner, uint256 payout, uint256 takeFee);
    event Cancelled(uint256 indexed id, address indexed client, uint256 refund);

    error NotVerifier();
    error NotClient();
    error BadStatus();
    error DeadlinePassed();
    error NoSubmissions();
    error WinnerNotSubmitter();
    error ZeroAmount();

    constructor(address _usdc, address _verifier, address _treasury) {
        usdc = _usdc;
        verifier = _verifier;
        treasury = _treasury;
    }

    function postBounty(uint256 amount, uint64 deadline, bytes32 brief) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlinePassed();
        if (!IERC20(usdc).transferFrom(msg.sender, address(this), amount)) revert();

        id = nextBountyId++;
        bounties[id] = Bounty({
            client: msg.sender,
            amount: amount,
            deadline: deadline,
            brief: brief,
            status: Status.Open,
            submissionCount: 0
        });
        emit BountyPosted(id, msg.sender, amount, deadline, brief);
    }

    function submit(uint256 id, bytes32 contentHash) external returns (uint256 idx) {
        Bounty storage b = bounties[id];
        if (b.status != Status.Open) revert BadStatus();
        if (block.timestamp > b.deadline) revert DeadlinePassed();

        idx = submissions[id].length;
        submissions[id].push(Submission({
            submitter: msg.sender,
            contentHash: contentHash,
            submittedAt: uint64(block.timestamp)
        }));
        b.submissionCount += 1;
        emit Submitted(id, msg.sender, idx, contentHash);
    }

    function declareWinner(uint256 id, uint256 submissionIdx) external {
        if (msg.sender != verifier) revert NotVerifier();
        Bounty storage b = bounties[id];
        if (b.status != Status.Open) revert BadStatus();
        Submission[] storage subs = submissions[id];
        if (subs.length == 0) revert NoSubmissions();
        if (submissionIdx >= subs.length) revert WinnerNotSubmitter();

        b.status = Status.Resolved;
        uint256 takeFee = (b.amount * TAKE_BPS) / BPS;
        uint256 payout = b.amount - takeFee;

        address winner = subs[submissionIdx].submitter;
        if (!IERC20(usdc).transfer(winner, payout)) revert();
        if (takeFee > 0 && !IERC20(usdc).transfer(treasury, takeFee)) revert();
        emit WinnerDeclared(id, winner, payout, takeFee);
    }

    /// @notice Client may cancel only if no submissions came in before deadline.
    function cancel(uint256 id) external {
        Bounty storage b = bounties[id];
        if (b.client != msg.sender) revert NotClient();
        if (b.status != Status.Open) revert BadStatus();
        if (block.timestamp <= b.deadline) revert DeadlinePassed();
        if (b.submissionCount != 0) revert BadStatus();

        b.status = Status.Cancelled;
        if (!IERC20(usdc).transfer(b.client, b.amount)) revert();
        emit Cancelled(id, b.client, b.amount);
    }

    function getSubmissions(uint256 id) external view returns (Submission[] memory) {
        return submissions[id];
    }
}
