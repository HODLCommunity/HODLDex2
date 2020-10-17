# HODL2
HODL2 refactor

## Install

npm install

## blockchain

./node_modules/.bin/ganache-cli -l 12000000 

## deploy

./node_modules/.bin/truffle migrate --reset

## test

./node_modules/.bin/truffle test

## Start Trading

The migration script ensures things are deployed and the deployer has super-admin permission. It will hook the Oracle for you so there's nothing you need to do. However, there are a few ceremonial steps to get it to start trading.

You have to set the EthUsd fallback price (used if Uniswap doesn't respond, which it won't because you're not on mainnet). Use oracleSetEthUsd(uint ethUsd). For that you need oracle permission which you might not have. You do have super-admin powers, so you can use grantRole(bytes32 role, address account) where account is you and role is MIGRATION_ROLE() emitted from the contract (just a long UID).

To start trading, revoke your MIGRATION_ROLE permission with revokeRole(role, address). Trading begins when no one has the MIGRATION ROLE. Trading begins when there are no users with MIGRATION_ROLE permission. See isRunning().

