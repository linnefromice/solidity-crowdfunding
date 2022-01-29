// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @author arata.haruyama
/// @title Factory for creating Crowdfunding project
contract ProjectFactory {
  event Created(address _contract, address _owner);

  Project[] public projectAddresses;

  // Create project.
  function createProject(address _projectOwner, uint _goalAmount) external {
    Project project = new Project(_projectOwner, _goalAmount);
    projectAddresses.push(project);
    emit Created(address(project), _projectOwner);
  }
}

/// @author arata.haruyama
/// @title Crowdfunding project
contract Project is ERC721 {
  event Contributed(address account, uint amount);
  event Closed(address owner);
  event Refunded(address account, uint amount);
  event Withdrawed(address owner, uint amount);

  address payable public owner;

  uint256 public currentTotalAmount; // current donation amount
  uint256 public goalTotalAmount; // donation amount goal
  uint256 public scheduledEndTime; // project's expected end date
  bool public isClosed; // project status

  address[] public addressIndexes; // addresses who did contributed this project.
  mapping(address => uint256) public donations;

  uint256 internal nextTokenId = 0; // token id for badge

  modifier onlyOwner {
    require(msg.sender == owner, "Only owner can call this.");
    _;
  }

  modifier activePj {
    require(!isClosed && block.timestamp < scheduledEndTime, "This project is already closed.");
    _;
  }

  modifier closedPj {
    require(isClosed || block.timestamp >= scheduledEndTime, "This project is active.");
    _;
  }

  modifier successedPj {
    require(currentTotalAmount >= goalTotalAmount, "This project failed.");
    _;
  }

  modifier failedPj {
    require(currentTotalAmount < goalTotalAmount, "This project was successful.");
    _;
  }

  constructor(address _owner, uint256 _goalAmount) ERC721("Badge", "BADGE") {
    owner = payable(_owner);
    currentTotalAmount = 0;
    goalTotalAmount = _goalAmount;
    scheduledEndTime = block.timestamp + 30 days; // Linter: Avoid to make time-based decisions in your business logic [not-rely-on-time]
    isClosed = false;
  }

  // Contribute to this project.
  function contribute() external payable activePj {
    require(msg.value >= 0.01 ether, "Need over 0.01 ETH for contribution.");

    uint256 _value = msg.value;
    uint256 oldDonation = donations[msg.sender];
    if (oldDonation == 0) {
      addressIndexes.push(msg.sender);
    }
    uint256 newDonation = oldDonation + _value;
    donations[msg.sender] = newDonation;
    currentTotalAmount += _value;

    // Calculate badge amount providing contributor.
    uint256 providingBatchQuantity = newDonation / 1 ether - oldDonation / 1 ether;
    if (providingBatchQuantity > 0) {
      for (uint i=0; i<providingBatchQuantity; i++) {
        mint(msg.sender);
      }
    }

    // Determine if this project is completed.
    if (currentTotalAmount >= goalTotalAmount) {
      isClosed = true;
    }
    emit Contributed(msg.sender, _value);
  }

  // Close project.
  function close() external payable onlyOwner activePj {
    isClosed = true;

    uint _len = addressIndexes.length;
    for (uint i=0; i<_len; i++) {
      address _addr = addressIndexes[i];
      if (_addr != address(0)) {
        uint256 _donation = donations[_addr];
        if (_donation != 0) {
          payable(_addr).transfer(_donation);
          donations[_addr] = 0;
        }
      }
    }
    emit Closed(owner);
  }

  // Refund to msg.sender.
  function refund() external payable closedPj failedPj {
    uint256 _donation = donations[msg.sender];
    if (_donation != 0) {
      // refund
      payable(msg.sender).transfer(_donation);
      donations[msg.sender] = 0;
    }

    emit Refunded(msg.sender, _donation);
  }

  // Withdraw successed project donations.
  function withdraw() external payable onlyOwner closedPj successedPj {
    owner.transfer(currentTotalAmount);
    emit Withdrawed(owner, currentTotalAmount);
  }

  // mint Badge.
  function mint(address _to) private {
    uint256 tokenId = nextTokenId;
    nextTokenId = tokenId + 1;
    super._mint(_to, tokenId);
  }
}
