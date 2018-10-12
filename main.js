'use strict';

const binance = require('node-binance-api');
var settings = require('./config');

binance.options({
  'APIKEY': settings.binance.apiKey,
  'APISECRET': settings.binance.secretKey
});

var AWS = require('aws-sdk');
// AWS.config.update({ region: "sa-east-1" });
// var dyn = new AWS.DynamoDB({ endpoint: new AWS.Endpoint('http://localhost:8000') });
AWS.config.update({ 
    accessKeyId: settings.aws.accessKeyId, 
    secretAccessKey: settings.aws.secretAccessKey, 
    region: 'sa-east-1'
});

var dyn = new AWS.DynamoDB({apiVersion: '2012-08-10'});

var timeoutOrder = 10000;
var timeoutCheck = 30000;
var timeoutConfig = 60000;
var debug = true;
var version = 21;
var interval = '1h';

var config = function () {
    var params = {
        TableName: 'Config',
        Key: {
          'symbol' : {S: 'BitBot'},
        }
      };
    
    try {
    // Call DynamoDB to read the item from the table
    dyn.getItem(params, function(err, data) {

        if (err) {
            log('Error', err);
        } else {

            timeoutOrder = parseInt(data.Item.timeoutOrder.N);
            timeoutCheck = parseInt(data.Item.timeoutCheck.N);
            debug = data.Item.debug.BOOL;
            interval = data.Item.interval.S;

            setTimeout(config, timeoutConfig);

        }
    });        
    } catch (error) {
        log('error', 'config error '+error.message);
    }
}
config();

var coin = {
    // coin specific variables
    symbol : '',
    qty : 0.00,
    gain : 0.00,
    fee : 0.05,
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    lot : { 
        minQty : 0.0, 
        maxQty : 0.0, 
        stepSize: 0.0, 
        stepPlaces: 0 
    },
    price : { 
        tickSize: 0.0, 
        tickPlaces: 0 
    },
    bid : {
        id : '',
        value : 0.0000 
    },
    ask : {
        id : '',
        value : 0.0000 
    },
    done : 0,
    init : false,
    trading : false,
    direction : ''
}

var log = function (type, message = '') {
    var now = new Date();
    now.setHours(now.getHours() - 3);
    console.log(now.toISOString()+' ('+type+') '+message);
}

var saveGain = function () {

    try {
        var bidTotal = coin.bid.value * coin.qty;
        var askTotal = coin.ask.value * coin.qty;
                            
        var grossGain = askTotal - bidTotal;
        var feeTotal = ((askTotal * (coin.fee / 100)) + (bidTotal * (coin.fee / 100))) * -1;
        var netGain = grossGain + feeTotal;

        var now = new Date();
        now.setHours(now.getHours() - 3);
    
        var params = {
            TableName: 'Trade',
            Item: {
              'datetime' : {S: now.toISOString()},
              'symbol' : {S: coin.symbol},
              'qty' : {N: coin.qty.toFixed(coin.lot.stepPlaces)},
              'bidValue' : {N: coin.bid.value.toFixed(coin.price.tickPlaces)},
              'askValue' : {N: coin.ask.value.toFixed(coin.price.tickPlaces)},
              'bidTotal' : {N: bidTotal.toFixed(coin.price.tickPlaces)},
              'askTotal' : {N: askTotal.toFixed(coin.price.tickPlaces)},
              'grossGain' : {N: grossGain.toFixed(coin.price.tickPlaces)},
              'fee' : {N: feeTotal.toFixed(coin.price.tickPlaces)},
              'netGain' : {N: netGain.toFixed(coin.price.tickPlaces)},
              'version' : {N: version.toString()}
            }
        };
          
        dyn.putItem(params, function(err, data) {
            try {
                if (err) { throw err };
            } catch (error) {
                log('error', 'saveGain error '+error.message);
            }
        });

        coin.trading = false;

    } catch (error) {
        log('error', 'saveGain error '+error.message);
    }

}

var checkBid = function () {

    if (!coin.trading) { return; }

    binance.orderStatus(coin.symbol, coin.bid.id, function(json) {

        try {
            
            if (!json) { throw new Error('Invalid API order status json'); }

            if (json.status == 'FILLED') {
                
                coin.done++;
                log('BOUGHT', 
                    'qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) +
                    ' value: ' + coin.bid.value.toFixed(coin.price.tickPlaces));

                saveGain();

            } else {

                setTimeout(checkBid, timeoutOrder);

            } 

        } catch (error) {
            log('error', 'checkBid.orderStatus() bid order ' + coin.bid.id +
                ' error: ' + error.message);

            setTimeout(checkBid, timeoutOrder);
        }
    });

}

var doBid = function() {

    if (!coin.trading) { return; }

    if (coin.done == 0) {

        binance.marketBuy(
            coin.symbol, 
            coin.qty.toFixed(coin.lot.stepPlaces), 
            {newOrderRespType : 'FULL'}, 
            function(response) {

            try {
            
                if (!response) { throw new Error('Invalid API buy response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
                if ( typeof response.fills !== "undefined" ) { 
                    var price = 0, quantity = 0, totalPrice = 0, totalQuantity = 0;
                    for (var i=0; i<response.fills.length; i++) {
                        price = parseFloat(response.fills[i].price);
                        quantity = parseFloat(response.fills[i].qty);
                        totalPrice += price * quantity;
                        totalQuantity += quantity;
                    }
                    coin.bid.value = totalPrice / totalQuantity;
                    coin.ask.value = coin.bid.value * (1 + (coin.gain / 100));
                }

                coin.bid.id = response.orderId;
                if (coin.bid.id == 'undefined') { throw new Error('Invalid bid order Id'); }
    
                coin.done++;
                log('BOUGHT', 
                    'qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) +
                    ' value: ' + coin.bid.value.toFixed(coin.price.tickPlaces));

                doAsk();
    
            } catch (error) {
                log('error', 
                    'doBid().marketBuy qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) + 
                    ' value: ' + coin.bid.value.toFixed(coin.price.tickPlaces) + 
                    ' error: ' + error.message);
            }
    
        });

    } else {

         // Send bid order
        binance.buy(coin.symbol, 
            coin.qty.toFixed(coin.lot.stepPlaces), 
            coin.bid.value.toFixed(coin.price.tickPlaces), {}, function(response) {
            
            try {
                
                if (!response) { throw new Error('Invalid API buy response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }

                coin.bid.id = response.orderId;
                if (coin.bid.id == 'undefined') { throw new Error('Invalid bid order Id'); }

                checkBid();

            } catch (error) {
                log('error', 
                    'doBid().buy qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) + 
                    ' value: ' + coin.bid.value.toFixed(coin.price.tickPlaces) + 
                    ' error: ' + error.message);
            }
        });
    }

}

var checkAsk = function () {

    if (!coin.trading) { return; }

    binance.orderStatus(coin.symbol, coin.ask.id, function(json) {

        try {

            if (!json) { throw new Error('Invalid API order status json'); }

            if (json.status == 'FILLED') {

                coin.done++;
                log('SOLD', 'qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) + 
                    ' value: ' + coin.ask.value.toFixed(coin.price.tickPlaces));

                saveGain();

            } else {

                setTimeout(checkAsk, timeoutOrder);

            }

        } catch (error) {
            log('error', 'checkAsk.orderStatus ask order ' + coin.ask.id + 
                ' error: ' + error.message);

            setTimeout(checkAsk, timeoutOrder);
        }
    });

}  

var doAsk = function() {

    if (!coin.trading) { return; }

    if (coin.done == 0) {

        // Send ask order
        binance.marketSell(
            coin.symbol, 
            coin.qty.toFixed(coin.lot.stepPlaces), 
            {newOrderRespType : 'FULL'}, 
            function(response) {
            
            try {

                if (!response) { throw new Error('Invalid API sell response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
                if ( typeof response.fills !== "undefined" ) { 
                    var price = 0, quantity = 0, totalPrice = 0, totalQuantity = 0;
                    for (var i=0; i<response.fills.length; i++) {
                        price = parseFloat(response.fills[i].price);
                        quantity = parseFloat(response.fills[i].qty);
                        totalPrice += price * quantity;
                        totalQuantity += quantity;
                    }
                    coin.ask.value = totalPrice / totalQuantity;
                    coin.bid.value = coin.ask.value / (1 + (coin.gain / 100));
                }

                coin.ask.id = response.orderId;
                if (coin.ask.id == 'undefined') { throw new Error('Invalid ask order Id'); }

                coin.done++;
                log('SOLD', 'qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) + 
                    ' value: ' + coin.ask.value.toFixed(coin.price.tickPlaces));

                doBid();
                
            } catch (error) {
                log('error', 
                    'doAsk().marketSell qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) +
                    ' value: ' + coin.ask.value.toFixed(coin.price.tickPlaces) + 
                    ' error: ' + error.message);
            }

        });

    } else {

        // Send ask order
        binance.sell(coin.symbol, 
            coin.qty.toFixed(coin.lot.stepPlaces), 
            coin.ask.value.toFixed(coin.price.tickPlaces), {}, function(response) {
            
            try {

                if (!response) { throw new Error('Invalid API sell response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
                
                coin.ask.id = response.orderId;
                if (coin.ask.id == 'undefined') { throw new Error('Invalid ask order Id'); }

                checkAsk();
                
            } catch (error) {
                log('error', 
                    'doAsk().sell qty: ' + coin.qty.toFixed(coin.lot.stepPlaces) +
                    ' value: ' + coin.ask.value.toFixed(coin.price.tickPlaces) + 
                    ' error: ' + error.message);
            }

        });
    }
            
}

function decimalPlaces(num) {
    var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) { return 0; }
    return Math.max(
         0,
         // Number of digits right of decimal point.
         (match[1] ? match[1].length : 0)
         // Adjust for scientific notation.
         - (match[2] ? +match[2] : 0));
  }

var bitbot = function () {

    if (!coin.init) {

        binance.exchangeInfo(function(info) {
            try {
                if (!info) { throw new Error('Invalid API exchangeInfo'); }

                var filterCoin = info.symbols.filter(function(symbols) {
                    return symbols.symbol == coin.symbol;
                });
                var infoCoin = filterCoin[0];

                coin.status = infoCoin.status;
                if (coin.status != 'TRADING') { throw new Error('status '+coin.status); }

                coin.baseAsset = infoCoin.baseAsset;
                coin.quoteAsset = infoCoin.quoteAsset;

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'PRICE_FILTER';
                })
                var infoPriceFilter = searchFilter[0];
                coin.price.tickSize = parseFloat(infoPriceFilter.tickSize);
                coin.price.tickPlaces = decimalPlaces(coin.price.tickSize);

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'LOT_SIZE';
                })
                var infoLotFilter = searchFilter[0];
                
                coin.lot.minQty = parseFloat(infoLotFilter.minQty);
                coin.lot.maxQty = parseFloat(infoLotFilter.maxQty);
                coin.lot.stepSize = parseFloat(infoLotFilter.stepSize);
                coin.lot.stepPlaces = decimalPlaces(coin.lot.stepSize);

                coin.init = true;

                bitbot();

            } catch (error) {
                log('error', 'bitbot.exchangeInfo '+error.message);
            }
        });

    } else {

        if (coin.trading) {
            setTimeout(bitbot, timeoutCheck);
            return;
        }

        var params = {
            TableName: 'Config',
            Key: {
              'symbol' : {S: coin.symbol},
            }
          };
          
        // Call DynamoDB to read the item from the table
        dyn.getItem(params, function(err, data) {

            if (err) {
                log('Error', err);
            } else {

                var pause = parseInt(data.Item.pause.N);
                if (pause) {
                    if (debug) {
                        log('pause');
                    }
                    setTimeout(bitbot, timeoutCheck);
                    return;
                }

                coin.qty = parseFloat(data.Item.quantity.N);
                if (coin.qty < coin.lot.minQty || coin.qty > coin.lot.maxQty) { throw new Error('invalid qty value: '+coin.qty); }

                coin.gain = parseFloat(data.Item.maxGain.N);
                coin.fee = parseFloat(data.Item.fee.N);

                coin.trading = false;
                coin.done = 0;

                binance.candlesticks(coin.symbol, interval, function(klines) {

                    try {

                        if (!klines) { throw new Error('Invalid API candlesticks'); }

                        var open = parseFloat(klines[0][1]);
                        var close = parseFloat(klines[0][4]);
                        var change = ((close / open) - 1) * 100;

                        if (change >= 0.15) {
                            coin.direction = 'bull';
                        } else if (change <= -0.15) {
                            coin.direction = 'bear';
                        } else {
                            coin.direction = 'neutral';
                        }

                        if (debug) {
                            log('info', coin.direction + ' ' + change.toFixed(coin.price.tickPlaces));
                        }
    
                        if (coin.direction == 'bull') {
    
                            coin.trading = true;
                            doBid();
    
                        } else if (coin.direction == 'bear') {
    
                            coin.trading = true;
                            doAsk();
    
                        } 
    
                    } catch (error) {
                        log('error', 'bitbot.candlesticks '+error.message);
                    }

                }, { 'limit': 1} );

            }

            setTimeout(bitbot, timeoutCheck);

        });
    }
}

if (process.argv.length > 2) {

    var coinSymbol = process.argv[2];

    if (coinSymbol == 'BNBUSDT' || coinSymbol == 'BTCUSDT') {

        coin.symbol = coinSymbol;
        log('init', 'Initializing BitBot: '+coinSymbol);
        bitbot();

    } else {

        log('init', 'Invalid coin: '+coinSymbol);
        process.exit(0);

    }
} else {

    log('init', 'Use: node main.js <coin>');
    process.exit(0);

}