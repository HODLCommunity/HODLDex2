// Test buy and sell scenorios

const verbose = false;

const HOracle = artifacts.require("HOracle.sol");
const HodlDex = artifacts.require("HodlDex");
const HTokenReserve = artifacts.require("HTokenReserve");
const HodlDexProxyAdmin = artifacts.require("HodlDexProxyAdmin");
const HTokenReserveProxyAdmin = artifacts.require("HTokenReserveProxyAdmin");
const HodlDexProxy = artifacts.require("HodlDexProxy");
const HTokenReserveProxy = artifacts.require("HTokenReserveProxy");
const HTEthUsd = artifacts.require("HTEthUsd");

// constants
const nullBytes = "0x";
const nullBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

// world state snapshots
let world = [];

// players
let oracle;
let hodlDex;
let hTReserve;
let dexProxyAdmin;
let reserveProxyAdmin;
let dexProxy;
let reserveProxy; 
let hodlT;

let prodHodlDex;
let prodHTReserve;

let admin;
let alice;
let bob;

// initial conditions
let ONE = "1000000000000000000";
let hodlUsd  = "1275911627294879927"; // $1.2759, 18 deciminals
let ethUsd = "400000000000000000000"; // $400.00
let hodlUsdAfter1 = "1283282053617017077";
let decay  = "999999838576236000";
let accrualRate = "1001895824040634246";
let hodlSupply = "20000000000000000000000000"; // 20,000,000 x 10^18

// transactions
let lowGas = "200000";
let aliceDeposit = web3.utils.toWei("1", "ether");
let bobDeposit = web3.utils.toWei("1", "ether");
let aliceBuy1Eth = web3.utils.toWei("1", "ether");

let aliceSell1Hodl = "100000000000000000000"; 
let aliceSell1Rmdr = "212908117444877792721"; // alice will have this much hodl left after opening one sell order

let bobBuy1Eth = web3.utils.toWei("1", "ether"); // Bob will buy alice's hodl from her sell order

contract("HodlDex", accounts => {

	beforeEach(async () => {
		let tokenAddress;
		assert.isAtLeast(accounts.length, 3, "should have at least 3 unlocked, funded accounts");
        [ admin, alice, bob ] = accounts;
        world = [{}];

		// deploy contracts
		oracle = await HOracle.new();
		hodlDex = await HodlDex.new();
		hTReserve = await HTokenReserve.new();
		dexProxyAdmin = await HodlDexProxyAdmin.new();
		reserveProxyAdmin = await HTokenReserveProxyAdmin.new();
		hodlT = await HTEthUsd.new();

		// proxies need contract addresses
		dexProxy = await HodlDexProxy.new(
			hodlDex.address, 
	    	dexProxyAdmin.address, 
	    	nullBytes);
		reserveProxy = await HTokenReserveProxy.new(
			hTReserve.address, 
	    	reserveProxyAdmin.address, 
	    	nullBytes);

		prodHodlDex = await HodlDex.at(dexProxy.address);
		prodHTReserve = await HTokenReserve.at(reserveProxy.address);

	    await prodHTReserve.init(prodHodlDex.address);
	    tokenAddress = await prodHTReserve.erc20Token();

	    await prodHodlDex.init(
	    	prodHTReserve.address,
	    	oracle.address
	    );

	    await prodHodlDex.oracleSetEthUsd(ethUsd);
	});

	it("should be ready to test", async () => {
		assert.strictEqual(true, true, "Bad start.");
	});

	it("Should give the deployer role admin and role privileges", async () => {
		let MIGRATION_ROLE = await prodHodlDex.MIGRATION_ROLE();
		let RESERVE_ROLE = await prodHodlDex.RESERVE_ROLE();
    	let ORACLE_ROLE = await prodHodlDex.ORACLE_ROLE();
    	let ADMIN_ROLE = await prodHodlDex.ADMIN_ROLE();

    	let hasMigration = await prodHodlDex.hasRole(MIGRATION_ROLE, admin);
    	let hasReserve = await prodHodlDex.hasRole(RESERVE_ROLE, prodHTReserve.address); // <==== look
    	let hasOracle = await prodHodlDex.hasRole(ORACLE_ROLE, admin);
    	let hasAdmin = await prodHodlDex.hasRole(ADMIN_ROLE, admin);

    	let adminMigrationRole = await prodHodlDex.getRoleAdmin(MIGRATION_ROLE);
    	let adminReserveRole = await prodHodlDex.getRoleAdmin(RESERVE_ROLE);
    	let adminOracleRole = await prodHodlDex.getRoleAdmin(ORACLE_ROLE);
    	let adminAdminRole = await prodHodlDex.getRoleAdmin(ADMIN_ROLE);

    	let isMigrationAdmin = await prodHodlDex.hasRole(adminMigrationRole, admin);
    	let isReserveAdmin = await prodHodlDex.hasRole(adminReserveRole, admin);
    	let isOracleAdmin = await prodHodlDex.hasRole(adminOracleRole, admin);
    	let isAdminAdmin = await prodHodlDex.hasRole(adminAdminRole, admin);

    	assert.strictEqual(hasMigration, true, "deployer missing migration role");
    	assert.strictEqual(hasReserve, true, "reserve missing reserve role");
    	assert.strictEqual(hasOracle, true, "deployer missing oracle role");
    	assert.strictEqual(hasAdmin, true, "deployer missing admin role");

    	assert.strictEqual(isMigrationAdmin, true, "deployer is not the migration role admin");
    	assert.strictEqual(isReserveAdmin, true, "deployer is not the reserve role admin");
    	assert.strictEqual(isOracleAdmin, true, "deployer is not the orgacle role admin");
    	assert.strictEqual(isAdminAdmin, true, "deployer is not the admin role admin");
	})

	it("should recognize the correct Oracle contract in the dex", async () => {
		let oracleAddr = await prodHodlDex.oracleContract({from: admin});
		assert.strictEqual(oracleAddr, oracle.address, "Dex doesn't have the right Oracle address");
	});

	it("should recognize the correct TokenReserve contract in the dex", async () => {
		let reserveAddr = await prodHodlDex.tokenReserveContract({from: admin});
		assert.strictEqual(reserveAddr, prodHTReserve.address, "Dex doesn't have the right Token Reserve address");
	});	

	it("should recognize the correct Dex contract in the reserve", async () => {
		let dexAddr = await prodHTReserve.dexContract({from: admin});
		assert.strictEqual(dexAddr, prodHodlDex.address, "Reserve doesn't have the right Dex address");
	});	

	it("should return the expected ETH_USD value when the Oracle cannot respond", async () => {
		let quote = await prodHodlDex.ETH_USD();
		assert.strictEqual(quote.toString(), ethUsd.toString(), "Historic ETH_USD is not set as expected.");
	});

	it("should convert Eth to Hodl", async () => {
		let convert = await prodHodlDex.convertEthToHodl(ONE); //
		let rates = await prodHodlDex.rates();
		let inEth = web3.utils.toBN(ONE);
		let ethToUSD = web3.utils.toBN(ethUsd);
		let inUSD = inEth.mul(ethToUSD);
		let asHodl = inUSD.div(rates[0]);
		// console.log("ONEEthToHodl", convert.toString(10));
		assert.notEqual(convert.toString(10), 0, "It did not produce a valid conversion");
		assert.strictEqual(convert.toString(10), asHodl.toString(10), "Does not convert Eth to Usd as expected.");
	});

	it("should have a reserve and the total supply of hodlc should be held by the dex", async () => {
		let reserve = await prodHodlDex.user(prodHodlDex.address, {from: admin});
		assert.strictEqual(reserve.balanceHodl.toString(10), hodlSupply, "Initial hodl reserve is incorrect");
	});

	it("should perform unit conversions", async () => {
		let ethToHodl = await prodHodlDex.convertEthToHodl(ONE);
		let hodlToEth = await prodHodlDex.convertHodlToEth(ethToHodl);
		let ethToUsd = await prodHodlDex.convertEthToUsd(ONE);
		let usdToEth = await prodHodlDex.convertUsdToEth(ethToUsd);
		let hodlToUsd = await prodHodlDex.convertHodlToUsd(ONE);
		let usdToHodl = await prodHodlDex.convertUsdToHodl(hodlToUsd);

		assert.strictEqual(ethToUsd.toString(10), ethUsd, "It failed to convert eth to usd");
		assert.strictEqual(usdToHodl.toString(10), ONE, "It failed to convert hodl to usd and back");
	});

	it("should let Alice make a deposit", async () => {
		await startTrading();
		await prodHodlDex.depositEth({from: alice, value: aliceDeposit});
		let userAlice = await prodHodlDex.user(alice, {from: alice});
		let balanceAlice = userAlice.balanceEth;
		assert.strictEqual(balanceAlice.toString(10), aliceDeposit.toString(10), "Alice's Eth balance does not equal her deposit");
	});

	it("should let Alice buy from the reserve", async () => {
		await startTrading();
		await prodHodlDex.depositEth({from: alice, value: aliceDeposit});
		let hodlVol = await prodHodlDex.convertEthToHodl(aliceBuy1Eth);
		await prodHodlDex.buyHodlC(aliceBuy1Eth, lowGas, {from: alice});
		
		let userAlice = await prodHodlDex.user(alice, {from: alice});
		let reserve = await prodHodlDex.user(prodHodlDex.address, {from: alice});
		let totalSupply = userAlice.balanceHodl.add(reserve.balanceHodl);

		assert.strictEqual(totalSupply.toString(10), hodlSupply, "Conservation of hodl supply violated");
		assert.strictEqual(userAlice.balanceHodl.toString(10), hodlVol.toString(10), "Alice didn't get the right amount of hodl");
	});

	it("should let Alice open a sell order", async () => {
		let w;
		let worlds = [];
		let ready = await startTrading();
		await prodHodlDex.depositEth({from: alice, value: aliceDeposit});
		w = await worldSnapshot();
		worlds.push(w);

		await prodHodlDex.buyHodlC(aliceBuy1Eth, lowGas, {from: alice});
		await prodHodlDex.sellHodlC(aliceSell1Hodl, lowGas, {from: alice});
		w = await worldSnapshot();
		worlds.push(w);	
		
		await compareSupply(worlds[0], worlds[1], "Alice bought from reserve and opened a sell order");	

		let userAlice = await prodHodlDex.user(alice, {from: bob});
		let rates = await prodHodlDex.rates({from: bob});
		let sellOrderCount = await prodHodlDex.sellOrderCount({from: bob});
		let orderId = await prodHodlDex.sellOrderFirst({from: bob});
		let order = await prodHodlDex.sellOrder(orderId, {from: bob});

		assert.strictEqual(sellOrderCount.toString(10), "1", "There is not exactly 1 sell order");
		assert.strictEqual(order.seller, alice, "The order seller is not Alice");
		assert.strictEqual(order.volumeHodl.toString(10), aliceSell1Hodl, "The order volume is not what Alice asked for");
		assert.strictEqual(userAlice.balanceHodl.toString(10), aliceSell1Rmdr, "Alice's hodl balance is inaccurate");
		assert.strictEqual(rates.hodlUsd.toString(10), hodlUsdAfter1, "HodlUsd price did not increase as expected");
	});

	it("should let Bob fill Alice's sell order", async  () => {
		let w;
		let worlds = [];
		let ready = await startTrading();
		w = await worldSnapshot();
		worlds.push(w);
		
		await prodHodlDex.depositEth({from: alice, value: aliceDeposit});
		await prodHodlDex.depositEth({from: bob, value: bobDeposit});
		w = await worldSnapshot();
		worlds.push(w);

		await prodHodlDex.buyHodlC(aliceBuy1Eth, lowGas, {from: alice}); // buy from reserve
		await prodHodlDex.sellHodlC(aliceSell1Hodl, lowGas, {from: alice}); // open a sell order
		await prodHodlDex.buyHodlC(bobBuy1Eth, lowGas, {from: bob}); // fill sell order, and buy from reserve. Alice gets distribution	
		w = await worldSnapshot();
		worlds.push(w);

		let aliceSellId = await prodHodlDex.sellOrderFirst({from: bob});
		let aliceSellOrder = await prodHodlDex.sellOrder(aliceSellId, {from: bob});		

		await compareSupply(worlds[0], worlds[1], "Alice and bob deposited eth");
		await compareSupply(worlds[1], worlds[2], "Bob filled alice's sell order and bought from reserve");		

		assert.equal(worlds[1].contractEth.toString(10), web3.utils.toWei("2", "ether"), "The contract is not holding 2 eth as expected");
	});
});

async function startTrading() {
	let MIGRATION_ROLE = await prodHodlDex.MIGRATION_ROLE();
	// TODO: Use the Oracle function to inject ETH_USD starting value
	await prodHodlDex.revokeRole(MIGRATION_ROLE, admin, {from: admin});
}

async function hodlUsdBN() {
	hodlUsd = await hodlDex.convertHodlToUsd(one, {from: alice});
	hodlUsd = hodlUsd.div(web3.utils.toBN(10**18));
	return hodlUsd;
}

async function compareSupply(world1, world2, remark) {

	if(world1.hodlSupply.toString(10) != world2.hodlSupply.toString(10)) {
		console.log("Compare Supply: ", remark);
		console.log("World 1:");
		console.log("-------------");
		console.log(world1);
		console.log("World 2:");
		console.log("-------------");
		console.log(world2);
	}

	assert.equal(world1.hodlSupply, world2.hodlSupply, "Hodl supply changed: " + remark);
}

async function worldSnapshot() {
	
	let distributions = [];
	let sellOrders = [];
	let buyOrders = [];

	let world = {
		contractEth: 0,
		hodlSupply: 0,
		sellOrders: {
			count: 0,
			book: []
		},
		userAlice: {
			balances: {}
		},
		userBob: {
			balances: {}
		},
		buyOrders: {
			count: 0,
			book: []
		}
	};

	let contractEth = await web3.eth.getBalance(prodHodlDex.address);
	let reserve = await prodHodlDex.user(prodHodlDex.address, {from: admin});
	let userAlice = await prodHodlDex.user(alice, {from: bob});
	let userBob = await prodHodlDex.user(bob, {from: alice});	
	let sellOrderCount = await prodHodlDex.sellOrderCount({ from: admin});
	let buyOrderCount = await prodHodlDex.buyOrderCount({ from: bob});

	let totalEth = userAlice.balanceEth.add(userBob.balanceEth);	
	let totalHodl = userAlice.balanceHodl.add(userBob.balanceHodl).add(reserve.balanceHodl);

	let sellOrderCounter = 0;
	let sellOrderNext = await prodHodlDex.sellOrderFirst({from: alice});

	while(typeof(sellOrderNext) != 'undefined' && sellOrderNext != nullBytes32) {
		let sellOrder = await prodHodlDex.sellOrder(sellOrderNext, {from: bob});
		sellOrder.id = sellOrderNext;
		sellOrderCounter++;
		sellOrders.push(JSON.stringify(sellOrder));
		totalHodl = totalHodl.add(sellOrder.volumeHodl);
		sellOrderNext = await prodHodlDex.sellOrderIterate(sellOrderNext, {from: alice}).idAfter;
	}

	let buyOrderCounter = 0;
	let buyOrderNext = await prodHodlDex.buyOrderFirst({ from: alice});

	while(typeof buyOrderNext != 'undefined' && buyOrderNext != nullBytes32) {
		let buyOrder = await prodHodlDex.buyOrder(buyOrderNext, {from: alice});
		buyOrder.id = buyOrderNext;
		buyOrderCounter ++;
		buyOrders.push(JSON.stringify(buyOrder));
		totalEth = totalEth.add(buyOrder.bidEth);
		buyOrderNext = await prodHodlDex.buyOrderIterate(buyOrderNext, {from: bob}).idAfter;
	}

	world.contractEth = contractEth.toString(10);
	world.hodlSupply = totalHodl.toString(10);
	userAlice.balanceEth = userAlice.balanceEth.toString(10);
	userAlice.balanceHodl = userAlice.balanceHodl.toString(10);
	userBob.balanceEth = userBob.balanceEth.toString(10);
	userBob.balanceHodl = userBob.balanceHodl.toString(10);
	world.userAlice.balances = userAlice;
	world.userBob.balances = userBob;
	world.sellOrders.count = sellOrderCount.toString(10);
	world.sellOrders.book = sellOrders;
	world.buyOrders.count = buyOrderCount.toString(10);
	world.buyOrders.book = buyOrders;

	if(verbose) {
		console.log("World Snapshot");
		console.log("--------------");
		console.log(world);
	}
	assert.strictEqual(totalHodl.toString(10), hodlSupply.toString(10), "Cannot reconcile hodl supply");
	return world;
}