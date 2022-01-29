import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";

const deployFactory = async () => {
  const [owner] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("ProjectFactory", owner);
  const contract = await factory.deploy();
  await contract.deployed();

  return {
    contract: contract,
    owner: owner,
  };
}

describe("ProjectFactory", () => {
  it(".createProject", async () => {
    const { contract: c, owner } = await deployFactory();
    const _totalAmount = ethers.utils.parseEther("0.1")
    await expect(c.createProject(owner.address, _totalAmount)).to.emit(c, "Created");
  })
})

const deploy = async (goalTotalAmount: BigNumber) => {
  const [owner, ...addrs] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("Project", owner);
  const contract = await factory.deploy(owner.address, goalTotalAmount);
  await contract.deployed();

  return {
    contract: contract,
    owner: owner,
    addrs: addrs
  };
}

describe("Project", () => {
  it(".constructor", async () => {
    const totalAmount = ethers.utils.parseEther("0.1")
    const { contract: c, owner } = await deploy(BigNumber.from(totalAmount));
    expect(await c.owner()).to.equal(owner.address);
    expect(await c.currentTotalAmount()).to.equal(0);
    expect(await c.goalTotalAmount()).to.equal(BigNumber.from(totalAmount));
    expect(await c.isClosed()).to.equal(false);
  })

  describe(".contribute", () => {
    describe("result", () => {
      describe("success", () => {
        const _goalAmount = ethers.utils.parseEther("0.1")
        it("& finish project because goal reached", async () => {
          const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
  
          await contract.connect(owner).contribute({ value: _goalAmount })
          const currentTotalAmount = await contract.currentTotalAmount()
          expect(currentTotalAmount).to.equal(_goalAmount.toString());
          expect(await contract.isClosed()).to.equal(true);
        });
        it("& continue project because goal not reached", async () => {
          const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
          const _valueContributed = _goalAmount.div(BigNumber.from("10"))
  
          await contract.connect(owner).contribute({ value: _valueContributed })
          const currentTotalAmount = await contract.currentTotalAmount()
          expect(currentTotalAmount).to.equal(_valueContributed.toString());
          expect(await contract.isClosed()).to.equal(false);
        });
        it("emit Contributed event.", async () => {
          const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
          await expect(contract.connect(owner).contribute({ value: _goalAmount }))
            .to.emit(contract, "Contributed").withArgs(owner.address, _goalAmount);
        });
        it("mint badges", async () => {
          const _goalAmount = ethers.utils.parseEther("2.0")
          const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
          await expect(contract.connect(owner).contribute({ value: ethers.utils.parseEther("1.0") }))
            .to.emit(contract, "Transfer").withArgs("0x0000000000000000000000000000000000000000", owner.address, 0);
          await expect(contract.connect(owner).contribute({ value: ethers.utils.parseEther("0.4") }))
            .to.not.emit(contract, "Transfer");
          await expect(contract.connect(owner).contribute({ value: ethers.utils.parseEther("1.8") }))
            .to.emit(contract, "Transfer").withArgs("0x0000000000000000000000000000000000000000", owner.address, 2);
        });
      });
      describe("failure", () => {
        it("Should fail when insufficient donation amount", async () => {
          const { contract, owner } = await deploy(BigNumber.from("1"));

          const insufficientAmount = ethers.utils.parseEther("0.00999")
          await expect(
            contract.connect(owner).contribute({ value: BigNumber.from(insufficientAmount) })
          ).to.be.revertedWith("Need over 0.01 ETH for contribution.")
        });
        it("Should fail when project closed", async () => {
          const _amount = ethers.utils.parseEther("0.00999");
          const { contract, owner } = await deploy(BigNumber.from(_amount));
          await contract.connect(owner).close();
          await expect(
            contract.connect(owner).contribute({ value: BigNumber.from(_amount) })
          ).to.be.revertedWith("This project is already closed.")
        })
      });
    });
    describe("process", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      describe("confirm people who can donate", () => {
        it("enable multi donation by one address", async () => {
          const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
          const _valueContributed = _goalAmount.div(BigNumber.from("10"))
          await contract.connect(owner).contribute({ value: _valueContributed })
          await contract.connect(owner).contribute({ value: _valueContributed })
          await contract.connect(owner).contribute({ value: _valueContributed })
          const currentTotalAmount = await contract.currentTotalAmount()
          expect(currentTotalAmount).to.equal(_valueContributed.mul(BigNumber.from("3")).toString());
        })
        it("enable donation by owner & others", async () => {
          const { contract, owner, addrs } = await deploy(BigNumber.from(_goalAmount));
          const _valueContributed = _goalAmount.div(BigNumber.from("10"))
          await contract.connect(owner).contribute({ value: _valueContributed })
          await contract.connect(addrs[0]).contribute({ value: _valueContributed })
          await contract.connect(addrs[0]).contribute({ value: _valueContributed })
          await contract.connect(addrs[1]).contribute({ value: _valueContributed })
          await contract.connect(addrs[0]).contribute({ value: _valueContributed })
          const currentTotalAmount = await contract.currentTotalAmount()
          expect(currentTotalAmount).to.equal(_valueContributed.mul(BigNumber.from("5")).toString());
        })
      });
      it("possible to over goal amount by last donation", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        const _valueContributed = _goalAmount.div(BigNumber.from("10"))
        await contract.connect(owner).contribute({ value: _valueContributed })
        await contract.connect(owner).contribute({ value: _valueContributed })
        await contract.connect(owner).contribute({ value: _goalAmount })
        const currentTotalAmount = await contract.currentTotalAmount()
        expect(currentTotalAmount).to.equal(_valueContributed.mul(BigNumber.from("12")).toString());
        expect(await contract.isClosed()).to.equal(true);
      })
    });
  });

  describe(".close", () => {
    describe("success", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      it("update status to closed", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await contract.connect(owner).close();
        expect(await contract.isClosed()).to.equal(true);
      });
      it("refund to all users", async () => {
        const { contract, owner, addrs } = await deploy(BigNumber.from(_goalAmount));
        const _valueContributed = _goalAmount.div(BigNumber.from("10"));
        await Promise.all(
          [0, 0, 1, 1, 1].map(
            async num => await contract
              .connect(addrs[num]).contribute({ value: _valueContributed })
          )
        )
        expect(await contract.donations(addrs[0].address)).to.equal(_valueContributed.mul(BigNumber.from("2")));
        expect(await contract.donations(addrs[1].address)).to.equal(_valueContributed.mul(BigNumber.from("3")));
        await contract.connect(owner).close();
        expect(await contract.donations(addrs[0].address)).to.equal(BigNumber.from("0"));
        expect(await contract.donations(addrs[1].address)).to.equal(BigNumber.from("0"));
      });
      it("emit Closed event.", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await expect(contract.connect(owner).close())
          .to.emit(contract, "Closed").withArgs(owner.address);
      });
    });
    describe("failure", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      it("Should fail when called by not owner", async () => {
        const { contract, addrs } = await deploy(BigNumber.from(_goalAmount));
        await expect(
          contract.connect(addrs[0]).close()
        ).to.be.revertedWith("Only owner can call this.")
      })
      it("Should fail when closed project", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await contract.connect(owner).contribute({ value: _goalAmount })
        await expect(
          contract.connect(owner).close()
        ).to.be.revertedWith("This project is already closed.")
      })
    });
  });

  describe(".refund", () => {
    describe("success", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      describe("In case of project closed by owner", () => {
        it("emit Refunded event.", async () => {
          const { contract, owner, addrs } = await deploy(BigNumber.from(_goalAmount));
          const _contributor = addrs[0];
          const _valueContributed = _goalAmount.div(BigNumber.from("10"));
          await contract.connect(_contributor).contribute({ value: _valueContributed });
          await contract.connect(owner).close();
          await expect(contract.connect(_contributor).refund())
            .to.emit(contract, "Refunded").withArgs(_contributor.address, 0); // close() で既に refund されているため
        });
      });
      describe("In case of project closed by timeup", () => {
        it("emit Refunded event.", async () => {
          const { contract, addrs } = await deploy(BigNumber.from(_goalAmount));
          const _contributor = addrs[0];
          const _valueContributed = _goalAmount.div(BigNumber.from("10"));
          await contract.connect(_contributor).contribute({ value: _valueContributed });
          // await network.provider.send('evm_setNextBlockTimestamp', [currentDate + 2592000001]) // + (30day + 1ms)
          await network.provider.send('evm_increaseTime', [2592000001]) // + (30day + 1ms)
          await expect(contract.connect(_contributor).refund())
            .to.emit(contract, "Refunded").withArgs(_contributor.address, _valueContributed); // close() で既に refund されているため
        });
      });
    });
    describe("failure", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      it("Should fail when active project", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await expect(
          contract.connect(owner).refund()
        ).to.be.revertedWith("This project is active.")
      })
      it("Should fail when success project", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await contract.connect(owner).contribute({ value: _goalAmount })
        await expect(
          contract.connect(owner).refund()
        ).to.be.revertedWith("This project was successful.")
      })
    });
  });

  describe(".withdraw", () => {
    describe("success", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      it("emit Withdrawed event.", async () => {
        const { contract, owner, addrs } = await deploy(BigNumber.from(_goalAmount));
        const _contributor = addrs[0];
        const _valueContributed = _goalAmount.div(BigNumber.from("10"));
        await contract.connect(_contributor).contribute({ value: _valueContributed });
        await contract.connect(_contributor).contribute({ value: _valueContributed });
        await contract.connect(_contributor).contribute({ value: _goalAmount });
        await expect(contract.connect(owner).withdraw())
          .to.emit(contract, "Withdrawed").withArgs(owner.address, _goalAmount.add(_valueContributed).add(_valueContributed));
      });
    });
    describe("failure", () => {
      const _goalAmount = ethers.utils.parseEther("0.1")
      it("Should fail when called by not owner", async () => {
        const { contract, addrs } = await deploy(BigNumber.from(_goalAmount));
        await expect(
          contract.connect(addrs[0]).withdraw()
        ).to.be.revertedWith("Only owner can call this.")
      })
      it("Should fail when active project", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await expect(
          contract.connect(owner).withdraw()
        ).to.be.revertedWith("This project is active.")
      })
      it("Should fail when active project (reason is time)", async () => {
        const { contract, owner } = await deploy(BigNumber.from(_goalAmount));
        await network.provider.send('evm_increaseTime', [2592000001]) // + (30day + 1ms)
        await expect(
          contract.connect(owner).withdraw()
        ).to.be.revertedWith("This project failed.")
      })
    });
  });
})