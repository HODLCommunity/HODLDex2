/**
 * Deploy and link libraries and contracts
 */

const HOracle = artifacts.require("HOracle.sol");
const HodlDex = artifacts.require("HodlDex");
const HTokenReserve = artifacts.require("HTokenReserve");
const HodlDexProxyAdmin = artifacts.require("HodlDexProxyAdmin");
const HTokenReserveProxyAdmin = artifacts.require("HTokenReserveProxyAdmin");
const HodlDexProxy = artifacts.require("HodlDexProxy");
const HTokenReserveProxy = artifacts.require("HTokenReserveProxy");
const Proportional = artifacts.require("Proportional");
const ProportionalTest = artifacts.require("ProportionalTest");

module.exports = async function (deployer) {
    
    const NULL = "0x";
    await deployer.deploy(HOracle);
    await deployer.deploy(HodlDex);
    await deployer.deploy(HTokenReserve);
    await deployer.deploy(HodlDexProxyAdmin);  
    await deployer.deploy(HTokenReserveProxyAdmin);
    await deployer.deploy(Proportional);
    await deployer.link(Proportional, ProportionalTest);
    await deployer.deploy(ProportionalTest);

    let oracle = await HOracle.deployed();
    let hodlDex = await HodlDex.deployed();
    let hTokenReserve = await HTokenReserve.deployed();
    let hodlDexProxyAdmin = await HodlDexProxyAdmin.deployed();
    let hTokenReserveProxyAdmin = await HTokenReserveProxyAdmin.deployed();
    let proportionalTest = await ProportionalTest.deployed();

    await deployer.deploy(HTokenReserveProxy, 
    	hTokenReserve.address, 
    	hTokenReserveProxyAdmin.address, 
    	NULL);

    await deployer.deploy(HodlDexProxy, 
    	hodlDex.address, 
    	hodlDexProxyAdmin.address, 
    	NULL);

    let tokenReserveProxy = await HTokenReserveProxy.deployed();
    let hodlDexProxy = await HodlDexProxy.deployed();
    let upgradableTokenReserve = await HTokenReserve.at(tokenReserveProxy.address);
    let upgradableHodlDex = await HodlDex.at(hodlDexProxy.address)

    // function init(address dexContract) external initializer()
    await upgradableTokenReserve.init(upgradableHodlDex.address);
    let tokenAddress = await upgradableTokenReserve.erc20Token();

    // function init(ITokenReserve _tokenReserve, IERC20 _token, IOracle _oracle) external initializer() 
    await upgradableHodlDex.init(
    	upgradableTokenReserve.address,
    	oracle.address
    );

    console.log("---------------------------------------------------------------------");
    console.log("HTEthUsd (erc20 token, production)", tokenAddress);
    console.log("HOracle (replaceable contract, production)", oracle.address);
    console.log("---------------------------------------------------------------------");
    console.log("HodlDex (internal implementation)", hodlDex.address);
    console.log("HTokenReserve (internal implementation)", hTokenReserve.address);
    console.log("---------------------------------------------------------------------");
    console.log("HodlDexProxyAdmin (contract, production)", hodlDexProxyAdmin.address);
    console.log("hTokenReserveProxyAdmin (contract, production)", hTokenReserveProxyAdmin.address);
    console.log("---------------------------------------------------------------------");
    console.log("HodlDex Proxy (upgradable HodlDex, production)", upgradableHodlDex.address);
    console.log("HTokenReserve Proxy (upradable Token Reserve, production)", upgradableTokenReserve.address);
    console.log("---------------------------------------------------------------------");
};
