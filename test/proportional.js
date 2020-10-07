const timeMachine = require('ganache-time-traveler');
const ProportionalTest = artifacts.require("ProportionalTest.sol");

let admin;
let alice;
let bob;
let test;

const HODL = "0xf0a5429dabc7f51d218d3119bc4ca776cb42abb5725ccd62a1577f01f196508e"
const ETH  = "0x4c10068c4e8f0b2905447ed0a679a3934513092c8a965b7a3d1ea67ea1cd0698"
const MONTH = 60 * 1440 * 31;

const ONE   = "1000000000000000000";
const TWO   = "2000000000000000000";
const THREE = "3000000000000000000";
const SUPPLY = "2000000000000000000000000";
const PRECISION = web3.utils.toBN(10 ** 18);

const supply = web3.utils.toBN(SUPPLY);
const distroAmtOne = web3.utils.toBN(ONE);
const distroAmtTwo = web3.utils.toBN(TWO);

contract("ProportionalTest", accounts => {

    beforeEach(async () => {
        let tokenAddress;
        assert.isAtLeast(accounts.length, 3, "should have at least 3 unlocked, funded accounts");
        [ admin, alice, bob ] = accounts;
        test = await ProportionalTest.new();
    });

    it("should be ready to test", async () => {
        assert.strictEqual(true, true, "something is wrong");
    });

    it("should increase and decrease user balances", async () => {
        await test.add(HODL, alice, ONE, 0);
        await test.add(HODL, alice, TWO, 0);
        await test.sub(HODL, alice, ONE, 0);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.sub(HODL, alice, ONE, 0);
        await test.add(HODL, alice, TWO, 0);
        let aliceWorld = await userWorld(HODL, alice, "Alice 3 HODL deposits total FOUR, 2 withdrawals total THREE (3 months later)");
        assert.equal(aliceWorld.balanceCount, 2, "Alice doesn't have exactly two balance histories.");
        assert.strictEqual(aliceWorld.balance, THREE, "Alice doesn't have the correct balance");
    });

    it("should increase the distributions", async () => {
        await test.increaseDistribution(HODL, ONE);
        await test.increaseDistribution(HODL, TWO);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(HODL, ONE);
        let aliceWorld = await userWorld(HODL, alice, "2 HODL distribution, total THREE, one month later, 1 distribution, total ONE");

        assert.equal(aliceWorld.distributionCount, 2, "There are not exactly two distributions");
        assert.strictEqual(aliceWorld.distributions[0].balance, THREE, "The first distribution is not exactly three");
        assert.strictEqual(aliceWorld.distributions[1].balance, ONE, "The second distribution is not exactly one");
        assert.equal(aliceWorld.distributions[0].period, 0, "The first distribution is not period 0");
        assert.equal(aliceWorld.distributions[1].period, 1, "The second distribution is not period 1");
        assert.strictEqual(aliceWorld.distributions[0].denominator, SUPPLY, "The first distribution did not close");
    });

    it("should skip distribution periods with no activity", async () => {
        await test.increaseDistribution(HODL, ONE);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(HODL, TWO);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(HODL, ONE);
        let aliceWorld = await userWorld(HODL, alice, "Distribute 1 HODL, ahead 2 months, 2 HODL, ahead 1 month, 1 HODL");

        assert.equal(aliceWorld.distributionCount, 3, "There are not exactly three distributions");
        assert.equal(aliceWorld.distributions[0].period, 0, "The first distribution is not period 0");
        assert.equal(aliceWorld.distributions[1].period, 2, "The second distribution is not period 2"); 
        assert.equal(aliceWorld.distributions[2].period, 3, "The third distribution is not period 3");
        assert.strictEqual(aliceWorld.distributions[0].denominator, SUPPLY, "The first distribution did not close");
        assert.strictEqual(aliceWorld.distributions[1].denominator, SUPPLY, "The second distribution did not close");
        assert.equal(aliceWorld.distributions[2].denominator, 0, "The last distribution is not open");
        assert.strictEqual(aliceWorld.distributions[0].balance, ONE, "The first distribution is not exactly one");  
        assert.strictEqual(aliceWorld.distributions[1].balance, TWO, "The second distribution is not exactly two"); 
        assert.strictEqual(aliceWorld.distributions[2].balance, ONE, "The third distribution is not exactly three");
    });

    it("should let users join after period zero and process their distributions correctly", async () => {
        let newBalance;
        let one = web3.utils.toBN(ONE);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        let aliceWorldAtStart = await userWorld(HODL, alice, "Fast forward four months");
       
        await test.add(HODL, alice, ONE, 0);
        let aliceWorldAfterDeposit = await userWorld(HODL, alice, "Alice deposits in period 4");
     
        await test.increaseDistribution(HODL, ONE);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.poke(HODL);
        let aliceWorldAfterDistribution = await userWorld(HODL, alice, "ONE was distributed and period 4 was closed");

        await test.processNextUserDistribution(HODL, alice);
        let aliceWorldAfterClaim = await userWorld(HODL, alice, "Alice claimed her period 4 distribution.");
        let bal = web3.utils.toBN(aliceWorldAfterDeposit.balance);
        newBalance = await getNewBalance(bal, one, supply, bal);

        assert.equal(aliceWorldAtStart.period, 4, "The test did not start in period 4 as expected");
        assert.equal(aliceWorldAfterDeposit.balances[0].period, 4, "Alice's deposit is not in period 4 as expected");
        assert.equal(aliceWorldAfterDeposit.distributionIndex, 1, "Alice is not skipping unclosed distributions prior to her first balance period");
        assert.equal(aliceWorldAfterDistribution.distributions[0].denominator, SUPPLY, "The first distribution did not close with poke()");
        assert.equal(aliceWorldAfterDistribution.distributions[0].balance, 0, "The first distribution has misallocated funds");
        assert.equal(aliceWorldAfterDistribution.distributions[1].period, 4, "The second distribution is not in period 4 as expected");
        assert.equal(aliceWorldAfterDistribution.distributions[1].balance, ONE, "The second distribution balance is one exactly ONE, as expected");
        assert.strictEqual(aliceWorldAfterClaim.balance, newBalance.toString(10), "Alice does not have the expected balance after claiming her first distribution from period 4");
    })

    it("should let the user claim a distribution", async () => {
        let alicePortionAmt = web3.utils.toBN(ONE);
        await test.add(HODL, alice, ONE, 0);
        await test.increaseDistribution(HODL, ONE);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(HODL, TWO);
        await test.processNextUserDistribution(HODL, alice);
        
        let aliceWorld = await userWorld(HODL, alice, "Alice processes 1 next distribution");
        let newBalance = await getNewBalance(alicePortionAmt, web3.utils.toBN(ONE), supply, web3.utils.toBN(ONE));

        assert.equal(aliceWorld.distributions[0].period, 0, "The first distribution is not period 0");
        assert.equal(aliceWorld.distributions[1].period, 2, "The second distribution is not period 2"); 
        assert.strictEqual(aliceWorld.distributions[0].denominator, SUPPLY, "The first distribution did not close");
        assert.strictEqual(aliceWorld.distributions[0].balance, ONE, "The first distribution is not exactly one");  
        assert.strictEqual(aliceWorld.distributions[1].balance, TWO, "The second distribution is not exactly two"); 
        assert.strictEqual(aliceWorld.balance, newBalance.toString(10), "Alice did not receive the expected distribution");
    });

    it("should let the user claim multiple distributions", async () => {
        let newbalance;
        await test.add(HODL, alice, ONE, 0);
        await test.add(HODL, alice, ONE, 0);
        await test.add(HODL, alice, ONE, 0);

        let aliceWorldAfterDeposits = await userWorld(HODL, alice, "Alice made three deposits into period 0 totalling THREE");
        let aliceInitialBalance = web3.utils.toBN(aliceWorldAfterDeposits.balance);

        await test.increaseDistribution(HODL, ONE);  // first distribution has money
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH); // start the third distribution period. Period 1 (month 2) does not exist. This is row 1.
        await test.increaseDistribution(HODL, ONE);
        await test.increaseDistribution(HODL, ONE);
        await timeMachine.advanceTimeAndBlock(MONTH); // start the fourth distribution period, period 3, month 4, row 2
        await test.increaseDistribution(HODL, ONE); // this period remains open. Preceeding periods are closed.
        let aliceWorldAfterDistributions = await userWorld(HODL, alice, "Distribute 1, 2 months, distribute 1 twice, 1 month, distribute 1");

        await test.processNextUserDistribution(HODL, alice); 
        let aliceWorldAfterProcessing1 = await userWorld(HODL, alice, "Alice processed the first nextDistribution for period 0 - her share of ONE");
        newBalance = await getNewBalance(aliceInitialBalance, distroAmtOne, supply, aliceInitialBalance);

        await test.processNextUserDistribution(HODL, alice); 
        let aliceWorldAfterProcessing2 = await userWorld(HODL, alice, "Alice processed the second nextDistribution for Period 2 - her share of TWO");
        newBalance = await getNewBalance(aliceInitialBalance, distroAmtTwo, supply, newBalance);

        await test.processNextUserDistribution(HODL, alice); 
        let aliceWorldAfterProcessing3 = await userWorld(HODL, alice, 
            "Alice tried to process the third nextDistribution for period 3 - this period is open and cannot be paid");

        // console.log("After 2 successful and one failed", aliceWorldAfterProcessing3);

        assert.equal(aliceWorldAfterProcessing3.distributionCount, 3, "There are not exactly three distributions");
        assert.equal(aliceWorldAfterProcessing3.distributions[0].period, 0, "The first distribution is not period 0");
        assert.equal(aliceWorldAfterProcessing3.distributions[1].period, 2, "The second distribution is not period 2"); 
        assert.strictEqual(aliceWorldAfterDistributions.distributions[1].denominator, SUPPLY, "The first distribution did not close");
        assert.strictEqual(aliceWorldAfterDistributions.distributions[0].balance, ONE, "The first distribution is not exactly one");  
        assert.strictEqual(aliceWorldAfterDistributions.distributions[1].balance, TWO, "The second distribution is not exactly TWO"); 
        assert.strictEqual(aliceWorldAfterProcessing3.balance, newBalance.toString(10) , 
            "Alice did not receive the expected distribution after three claims");

        // Continue from this point in time. 
        // close the period in which Alice's balance was just adjusted by her claims.
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(HODL, ONE); 

        // Alice tries again. She can now claim her period 3 distribution because it's closed

        await test.processNextUserDistribution(HODL, alice);
        let aliceWorldAfterProcessing4 = await userWorld(HODL, alice, 
            "Alice processed the third nextDistribution, again, for period 3 - her share of ONE using her updated balance");
        newBalance = await getNewBalance(newBalance, distroAmtOne, supply, newBalance);

        assert.equal(aliceWorldAfterProcessing4.distributionCount, 4, "There are not exactly four distributions");
        assert.strictEqual(aliceWorldAfterProcessing4.balance, newBalance.toString(10) , 
            "Alice did not receive the expected distribution after four claims");
    });

    it("should let the user claim multiple ETH distributions", async () => {
        let newBalance;
        await test.add(HODL, alice, ONE, 0);
        await test.add(HODL, alice, ONE, 0);
        await test.add(HODL, alice, ONE, 0);

        let aliceWorldAfterDeposits = await userWorld(HODL, alice, "HODL: Alice made three HODL deposits into period 0 totalling THREE");
        let aliceInitialBalanceETH = web3.utils.toBN(0);
        let aliceInitialBalanceHODL = web3.utils.toBN(THREE);

        await test.increaseDistribution(ETH, ONE);  // first distribution has money
        await timeMachine.advanceTimeAndBlock(MONTH);
        await timeMachine.advanceTimeAndBlock(MONTH); // start the third distribution period. Period 1 (month 2) does not exist. This is row 1.
        await test.increaseDistribution(ETH, ONE);
        await test.increaseDistribution(ETH, ONE);
        await timeMachine.advanceTimeAndBlock(MONTH); // start the fourth distribution period, period 3, month 4, row 2
        await test.increaseDistribution(ETH, ONE); // this period remains open. Preceeding periods are closed.
        let aliceWorldAfterDistributions = await userWorld(ETH, alice, "ETH: Distribute 1, 2 months, distribute 1 twice, 1 month, distribute 1");

        await test.processNextUserDistribution(ETH, alice); 
        let aliceWorldAfterProcessing1 = await userWorld(ETH, alice, "ETH: Alice processed the first nextDistribution for period 0 - her share of ONE");
        newBalance = await getNewBalance(aliceInitialBalanceHODL, distroAmtOne, supply, aliceInitialBalanceETH);

        await test.processNextUserDistribution(ETH, alice); 
        let aliceWorldAfterProcessing2 = await userWorld(ETH, alice, "ETH: Alice processed the second nextDistribution for Period 2 - her share of TWO");
        newBalance = await getNewBalance(aliceInitialBalanceHODL, distroAmtTwo, supply, newBalance);

        await test.processNextUserDistribution(ETH, alice); 
        let aliceWorldAfterProcessing3 = await userWorld(ETH, alice, 
            "ETH: Alice tried to process the third nextDistribution for period 3 - this period is open and cannot be paid");

        assert.equal(aliceWorldAfterProcessing3.distributionCount, 3, "There are not exactly three distributions");
        assert.equal(aliceWorldAfterProcessing3.distributions[0].period, 0, "The first distribution is not period 0");
        assert.equal(aliceWorldAfterProcessing3.distributions[1].period, 2, "The second distribution is not period 2"); 
        assert.strictEqual(aliceWorldAfterDistributions.distributions[1].denominator, SUPPLY, "The first distribution did not close");
        assert.strictEqual(aliceWorldAfterDistributions.distributions[0].balance, ONE, "The first distribution is not exactly one");  
        assert.strictEqual(aliceWorldAfterDistributions.distributions[1].balance, TWO, "The second distribution is not exactly TWO"); 
        assert.strictEqual(aliceWorldAfterProcessing3.balance, newBalance.toString(10) , 
            "Alice did not receive the expected distribution after three claims");

        // Continue from this point in time. 
        // close the period in which Alice's balance was just adjusted by her claims.
        await timeMachine.advanceTimeAndBlock(MONTH);
        await test.increaseDistribution(ETH, ONE); 

        // Alice tries again. She can now claim her period 3 distribution because it's closed
        await test.processNextUserDistribution(ETH, alice);
        let aliceWorldAfterProcessing4 = await userWorld(ETH, alice, 
            "ETH: Alice processed the third nextDistribution, again, for period 3 - her share of ONE using her updated balance");
        newBalance = await getNewBalance(aliceInitialBalanceHODL, distroAmtOne, supply, newBalance);

        assert.equal(aliceWorldAfterProcessing4.distributionCount, 4, "There are not exactly four distributions");
        assert.strictEqual(aliceWorldAfterProcessing4.balance, newBalance.toString(10) , 
            "Alice did not receive the expected distribution after four claims");
    });

    // continue testing in above scenarios ... balance updates, distribution
});

async function userWorld(asset, user, remark) {

    let world = {};
    let row = {};
    let balance;
    let balanceCount;
    let distribution;
    let distributionCount;
    let unclaimed;

    world.period = 0;
    world.balance = 0;
    world.balanceIndex;
    world.distributionIndex;
    world.balanceCount = 0;
    world.distributionCount = 0;
    world.distributions = [];
    world.balances = [];

    world.period = await test.period();
    world.period = world.period.toString(10);

    balance = await test.balanceOf(asset, user);
    world.balance = balance.toString(10);

    next = await test.nextUserDistributionDetails(asset, user);
    world.balanceIndex = next[1].toString(10);
    world.distributionIndex = next[2].toString(10);
    world.nextDistributionClosed = next[3];

    balanceCount = await test.userBalanceCount(asset, user);
    world.balanceCount = balanceCount.toString(10);

    distributionCount = await test.distributionCount(asset);
    world.distributionCount = distributionCount.toString(10);

    for(i=0; i<world.distributionCount; i++) {
        distribution = await test.distributionAtIndex(asset, i);
        row = {};
        row.denominator = distribution[0].toString(10); 
        row.balance = distribution[1].toString(10);
        row.period = distribution[2].toString(10);
        world.distributions.push(row);
    }

    for(i=0; i<world.balanceCount; i++) {
        balance = await test.userBalanceAtIndex(asset, user, i);
        row = {};
        row.balance = balance[0].toString(10);
        row.controlled = balance[1].toString(10);
        row.period = balance[2].toString(10);
        world.balances.push(row);
    }

    /*
    console.log("----------------------------------------------------------------------");
    console.log("User World: ", remark);
    console.log(world);
    */

    return world;
}

async function getNewBalance(shares, distroAmt, supply, initialBalance) {
    let shareRatio = (distroAmt.mul(PRECISION)).div(supply);
    let expectedDistribution = (shares.mul(shareRatio)).div(PRECISION);
    let expectedBalance = initialBalance.add(expectedDistribution);
    return expectedBalance;
}
