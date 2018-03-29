'use strict';

var hfc = require('fabric-client');
var path = require('path');
var bodyParser = require('body-parser');
// For printing formatted things
var util = require('util');
// API REST - Express pra atender solicitações do navegador
var express = require('express');
var app = express();

var options = {
    wallet_path: path.join(__dirname, './creds'),
    user_id: 'PeerAdmin',
    channel_id: 'mychannel',
    chaincode_id: 'certidao_nascimento',
    peer_url: 'grpc://localhost:7051',
    event_url: 'grpc://localhost:7053',
    orderer_url: 'grpc://localhost:7050',
    network_url: 'grpc://localhost:7051',
};

var channel = {};
var client = null;
var targets = [];
var tx_id = null;

// Assign any listening port for your webApp
var app_port = 3000;

// Enable CORS for ease of development and testing
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Use body-parser to parse the JSON formatted request payload
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router(); // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
// router.get('/', function(req, res) {
//     res.json({ message: 'Arcani Blockchain' });
// });

// more routes for our API will happen here
// on routes that end in /bears
// ----------------------------------------------------
router.post('/cadastraPessoa', function(req, res) {
    var key = req.query.Key;
    var personId = req.query.personId;
    var personFirstName = req.query.personFirstName;
    var personMiddleName = req.query.personMiddleName;
    var personSurname = req.query.personSurname;
    console.log("Requisitado POST: ", key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);
    //res.json(key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);
    Promise.resolve().then(() => {
        console.log("Create a client and set the wallet location");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("Set wallet path, and associate user ", options.user_id, " with application");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("Check user is enrolled, and set a query URL in the network");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("User not defined, or not enrolled - error");
        }
        channel = client.newChannel(options.channel_id);
        var peerObj = client.newPeer(options.peer_url);
        channel.addPeer(peerObj);
        channel.addOrderer(client.newOrderer(options.orderer_url));
        targets.push(peerObj);
        return;
    }).then(() => {
        tx_id = client.newTransactionID();
        console.log("Assigning transaction_id: ", tx_id._transaction_id);
        const request = {
            targets: targets,
            chaincodeId: options.chaincode_id,
            txId: tx_id._transaction_id,
            fcn: 'createPerson',
            args: [key, personId, personFirstName, personMiddleName, personSurname],
            chainId: options.channel_id,
            txId: tx_id
        };
        return channel.sendTransactionProposal(request);
    }).then((results) => {
        var proposalResponses = results[0];
        var proposal = results[1];
        var header = results[2];
        let isProposalGood = false;
        if (proposalResponses && proposalResponses[0].response &&
            proposalResponses[0].response.status === 200) {
            isProposalGood = true;
            console.log('transaction proposal was good');
        } else {
            console.error('transaction proposal was bad');
        }
        if (isProposalGood) {
            console.log(util.format(
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
                proposalResponses[0].response.status, proposalResponses[0].response.message,
                proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal,
                header: header
            };
            var transactionID = tx_id.getTransactionID();
            var eventPromises = [];
            let eh = client.newEventHub();
            eh.setPeerAddr(options.event_url);
            eh.connect();
            let txPromise = new Promise((resolve, reject) => {
                let handle = setTimeout(() => {
                    eh.disconnect();
                    reject();
                }, 30000);
                eh.registerTxEvent(transactionID, (tx, code) => {
                    clearTimeout(handle);
                    eh.unregisterTxEvent(transactionID);
                    eh.disconnect();

                    if (code !== 'VALID') {
                        console.error(
                            'The transaction was invalid, code = ' + code);
                        reject();
                    } else {
                        console.log(
                            'The transaction has been committed on peer ' +
                            eh._ep._endpoint.addr);
                        resolve();
                    }
                });
            });
            eventPromises.push(txPromise);
            var sendPromise = channel.sendTransaction(request);
            return Promise.all([sendPromise].concat(eventPromises)).then((results) => {
                console.log(' event promise all complete and testing complete');
                return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
            }).catch((err) => {
                console.error(
                    'Failed to send transaction and get notifications within the timeout period.'
                );
                return 'Failed to send transaction and get notifications within the timeout period.';
            });
        } else {
            console.error(
                'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
        }
    }, (err) => {
        console.error('Failed to send proposal due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send proposal due to error: ' + err.stack ? err.stack :
            err;
    }).then((response) => {
        if (response.status === 'SUCCESS') {
            console.log('Successfully sent transaction to the orderer.');
            return tx_id.getTransactionID();
        } else {
            console.error('Failed to order the transaction. Error code: ' + response.status);
            return 'Failed to order the transaction. Error code: ' + response.status;
        }
    }, (err) => {
        console.error('Failed to send transaction due to error: ' + err.stack ? err
            .stack : err);
        return 'Failed to send transaction due to error: ' + err.stack ? err.stack :
            err;
    });
    res.json(req.query);
});

router.get('/consultaPessoa', function(req, res) {
    var key = req.query.Key;
    var personId = req.query.personId;
    var personFirstName = req.query.personFirstName;
    var personMiddleName = req.query.personMiddleName;
    var personSurname = req.query.personSurname;

    Promise.resolve().then(() => {
        console.log("--- Create a client and set the wallet location [OK]");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("--- Set wallet path, and associate user ", options.user_id, " with application [OK]");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("--- Check user is enrolled, and set a query URL in the network [OK]");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("--- User not defined, or not enrolled - [ERRO]");
        }
        channel = client.newChannel(options.channel_id);
        channel.addPeer(client.newPeer(options.network_url));
        return;
    }).then(() => {
        console.log("--- Make query [OK]");
        var transaction_id = client.newTransactionID();
        console.log("--- Assigning transaction_id: ", transaction_id._transaction_id, " [OK]");

        const request = {
            chaincodeId: options.chaincode_id,
            txId: transaction_id,
            fcn: 'queryPerson',
            args: [key]
        };
	//res.json(key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);
	//res.json(query_responses[0]);
        return channel.queryByChaincode(request);
    }).then((query_responses) => {
        console.log("--- Returned from query [OK]");
        if (!query_responses.length) {
            console.log("--- No payloads were returned from query [OK]");
        } else {
            console.log("--- Query result count = ", query_responses.length, " [OK]")
        }
        if (query_responses[0] instanceof Error) {
            console.error("error from query = ", query_responses[0]);
        }
	res.status(200).json(query_responses[0].toString());
        console.log("--- Response is :\n ", query_responses[0].toString(), " [OK]");
        //res.status(200).json({ "value": query_responses[0].toString() });
    }).catch((err) => {
        console.error("Caught Error", err);
    });
    
    console.log("Requisitado GET: ", key);
    //res.json(key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);
});
//router.post('/', function(req, res) {});
//router.get('/:id', buscaPessoa, function(req, res) {});
//router.patch('/:id', buscaPessoa, function(req, res) {});
//router.delete('/:id', buscaPessoa, function(req, res) {});

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

module.exports = app;


//
// Add route for a chaincode query request for a specific state variable
//
app.get("/consultaPessoa/:var", function(req, res) {
    var stateVar = req.params.var;

    Promise.resolve().then(() => {
        console.log("--- Create a client and set the wallet location [OK]");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("--- Set wallet path, and associate user ", options.user_id, " with application [OK]");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("--- Check user is enrolled, and set a query URL in the network [OK]");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("--- User not defined, or not enrolled - [ERRO]");
        }
        channel = client.newChannel(options.channel_id);
        channel.addPeer(client.newPeer(options.network_url));
        return;
    }).then(() => {
        console.log("--- Make query [OK]");
        var transaction_id = client.newTransactionID();
        console.log("--- Assigning transaction_id: ", transaction_id._transaction_id, " [OK]");

        const request = {
            chaincodeId: options.chaincode_id,
            txId: transaction_id,
            fcn: 'queryPerson',
            args: [stateVar]
        };

        return channel.queryByChaincode(request);
    }).then((query_responses) => {
        console.log("--- Returned from query [OK]");
        if (!query_responses.length) {
            console.log("--- No payloads were returned from query [OK]");
        } else {
            console.log("--- Query result count = ", query_responses.length, " [OK]")
        }
        if (query_responses[0] instanceof Error) {
            console.error("error from query = ", query_responses[0]);
        }
        console.log("--- Response is :\n ", query_responses[0].toString(), " [OK]");
        res.status(200).json({ "value": query_responses[0].toString() });
    }).catch((err) => {
        console.error("Caught Error", err);
    });
});

app.get("/todasPessoas/", function(req, res) {

    Promise.resolve().then(() => {
        console.log("--- Create a client and set the wallet location [OK]");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("--- Set wallet path, and associate user ", options.user_id, " with application [OK]");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("--- Check user is enrolled, and set a query URL in the network [OK]");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("--- User not defined, or not enrolled - [ERRO]");
        }
        channel = client.newChannel(options.channel_id);
        channel.addPeer(client.newPeer(options.network_url));
        return;
    }).then(() => {
        console.log("--- Make query [OK]");
        var transaction_id = client.newTransactionID();
        console.log("--- Assigning transaction_id: ", transaction_id._transaction_id, " [OK]");

        const request = {
            chaincodeId: options.chaincode_id,
            txId: transaction_id,
            fcn: 'queryAllPeople',
            args: ['']
        };

        return channel.queryByChaincode(request);
    }).then((query_responses) => {
        console.log("--- Returned from query [OK]");
        if (!query_responses.length) {
            console.log("--- No payloads were returned from query [OK]");
        } else {
            console.log("--- Query result count = ", query_responses.length, " [OK]")
        }
        if (query_responses[0] instanceof Error) {
            console.error("error from query = ", query_responses[0]);
        }
        console.log("--- Response is :\n ", query_responses[0].toString(), " [OK]");
        res.status(200).json({ "value": query_responses[0].toString() });
    }).catch((err) => {
        console.error("Caught Error", err);
    });
});

app.get("/cadastraPessoa/:key/:personId/:personFirstName/:personMiddleName/:personSurname", function(req, res) {
    var key = req.params.key;
    var personId = req.params.personId;
    var personFirstName = req.params.personFirstName;
    var personMiddleName = req.params.personMiddleName;
    var personSurname = req.params.personSurname;
    console.log(key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);


    Promise.resolve().then(() => {
        console.log("Create a client and set the wallet location");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("Set wallet path, and associate user ", options.user_id, " with application");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("Check user is enrolled, and set a query URL in the network");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("User not defined, or not enrolled - error");
        }
        channel = client.newChannel(options.channel_id);
        var peerObj = client.newPeer(options.peer_url);
        channel.addPeer(peerObj);
        channel.addOrderer(client.newOrderer(options.orderer_url));
        targets.push(peerObj);
        return;
    }).then(() => {
        tx_id = client.newTransactionID();
        console.log("Assigning transaction_id: ", tx_id._transaction_id);
        const request = {
            targets: targets,
            chaincodeId: options.chaincode_id,
            txId: tx_id._transaction_id,
            fcn: 'createPerson',
            args: [key, personId, personFirstName, personMiddleName, personSurname],
            chainId: options.channel_id,
            txId: tx_id
        };
        return channel.sendTransactionProposal(request);
    }).then((results) => {
        var proposalResponses = results[0];
        var proposal = results[1];
        var header = results[2];
        let isProposalGood = false;
        if (proposalResponses && proposalResponses[0].response &&
            proposalResponses[0].response.status === 200) {
            isProposalGood = true;
            console.log('transaction proposal was good');
        } else {
            console.error('transaction proposal was bad');
        }
        if (isProposalGood) {
            console.log(util.format(
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
                proposalResponses[0].response.status, proposalResponses[0].response.message,
                proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal,
                header: header
            };
            var transactionID = tx_id.getTransactionID();
            var eventPromises = [];
            let eh = client.newEventHub();
            eh.setPeerAddr(options.event_url);
            eh.connect();
            let txPromise = new Promise((resolve, reject) => {
                let handle = setTimeout(() => {
                    eh.disconnect();
                    reject();
                }, 30000);

                eh.registerTxEvent(transactionID, (tx, code) => {
                    clearTimeout(handle);
                    eh.unregisterTxEvent(transactionID);
                    eh.disconnect();

                    if (code !== 'VALID') {
                        console.error(
                            'The transaction was invalid, code = ' + code);
                        reject();
                    } else {
                        console.log(
                            'The transaction has been committed on peer ' +
                            eh._ep._endpoint.addr);
                        resolve();
                    }
                });
            });
            eventPromises.push(txPromise);
            var sendPromise = channel.sendTransaction(request);
            return Promise.all([sendPromise].concat(eventPromises)).then((results) => {
                console.log(' event promise all complete and testing complete');
                return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
            }).catch((err) => {
                console.error(
                    'Failed to send transaction and get notifications within the timeout period.'
                );
                return 'Failed to send transaction and get notifications within the timeout period.';
            });
        } else {
            console.error(
                'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
        }
    }, (err) => {
        console.error('Failed to send proposal due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send proposal due to error: ' + err.stack ? err.stack :
            err;
    }).then((response) => {
        if (response.status === 'SUCCESS') {
            console.log('Successfully sent transaction to the orderer.');
            return tx_id.getTransactionID();
        } else {
            console.error('Failed to order the transaction. Error code: ' + response.status);
            return 'Failed to order the transaction. Error code: ' + response.status;
        }
    }, (err) => {
        console.error('Failed to send transaction due to error: ' + err.stack ? err
            .stack : err);
        return 'Failed to send transaction due to error: ' + err.stack ? err.stack :
            err;
    });

});

app.post("/cadastraPessoa/", function(req, res) {
    var key = req.body.key;
    var personId = req.body.personId;
    var personFirstName = req.body.personFirstName;
    var personMiddleName = req.body.personMiddleName;
    var personSurname = req.body.personSurname;
    console.log(key, " - ", personId, " - ", personFirstName, " - ", personMiddleName, " - ", personSurname);


    Promise.resolve().then(() => {
        console.log("Create a client and set the wallet location");
        client = new hfc();
        return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
    }).then((wallet) => {
        console.log("Set wallet path, and associate user ", options.user_id, " with application");
        client.setStateStore(wallet);
        return client.getUserContext(options.user_id, true);
    }).then((user) => {
        console.log("Check user is enrolled, and set a query URL in the network");
        if (user === undefined || user.isEnrolled() === false) {
            console.error("User not defined, or not enrolled - error");
        }
        channel = client.newChannel(options.channel_id);
        var peerObj = client.newPeer(options.peer_url);
        channel.addPeer(peerObj);
        channel.addOrderer(client.newOrderer(options.orderer_url));
        targets.push(peerObj);
        return;
    }).then(() => {
        tx_id = client.newTransactionID();
        console.log("Assigning transaction_id: ", tx_id._transaction_id);
        const request = {
            targets: targets,
            chaincodeId: options.chaincode_id,
            txId: tx_id._transaction_id,
            fcn: 'createPerson',
            args: [key, personId, personFirstName, personMiddleName, personSurname],
            chainId: options.channel_id,
            txId: tx_id
        };
        return channel.sendTransactionProposal(request);
    }).then((results) => {
        var proposalResponses = results[0];
        var proposal = results[1];
        var header = results[2];
        let isProposalGood = false;
        if (proposalResponses && proposalResponses[0].response &&
            proposalResponses[0].response.status === 200) {
            isProposalGood = true;
            console.log('transaction proposal was good');
        } else {
            console.error('transaction proposal was bad');
        }
        if (isProposalGood) {
            console.log(util.format(
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
                proposalResponses[0].response.status, proposalResponses[0].response.message,
                proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal,
                header: header
            };
            var transactionID = tx_id.getTransactionID();
            var eventPromises = [];
            let eh = client.newEventHub();
            eh.setPeerAddr(options.event_url);
            eh.connect();
            let txPromise = new Promise((resolve, reject) => {
                let handle = setTimeout(() => {
                    eh.disconnect();
                    reject();
                }, 30000);

                eh.registerTxEvent(transactionID, (tx, code) => {
                    clearTimeout(handle);
                    eh.unregisterTxEvent(transactionID);
                    eh.disconnect();

                    if (code !== 'VALID') {
                        console.error(
                            'The transaction was invalid, code = ' + code);
                        reject();
                    } else {
                        console.log(
                            'The transaction has been committed on peer ' +
                            eh._ep._endpoint.addr);
                        resolve();
                    }
                });
            });
            eventPromises.push(txPromise);
            var sendPromise = channel.sendTransaction(request);
            return Promise.all([sendPromise].concat(eventPromises)).then((results) => {
                console.log(' event promise all complete and testing complete');
                return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
            }).catch((err) => {
                console.error(
                    'Failed to send transaction and get notifications within the timeout period.'
                );
                return 'Failed to send transaction and get notifications within the timeout period.';
            });
        } else {
            console.error(
                'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
        }
    }, (err) => {
        console.error('Failed to send proposal due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send proposal due to error: ' + err.stack ? err.stack :
            err;
    }).then((response) => {
        if (response.status === 'SUCCESS') {
            console.log('Successfully sent transaction to the orderer.');
            return tx_id.getTransactionID();
        } else {
            console.error('Failed to order the transaction. Error code: ' + response.status);
            return 'Failed to order the transaction. Error code: ' + response.status;
        }
    }, (err) => {
        console.error('Failed to send transaction due to error: ' + err.stack ? err
            .stack : err);
        return 'Failed to send transaction due to error: ' + err.stack ? err.stack :
            err;
    });

});

app.use(function(req, res) {
    res.status(404).send({ url: req.originalUrl + ' not found' })
});

// //
// Start the HTTP server to listen for incoming requests
//
function startListener() {
    console.log("Starting WebApp on port " + app_port);
    app.listen(app_port);
    console.log("WebApp is now listening on port " + app_port + "\n");
}

startListener();
