'use strict';

var settings = require('./config');
const binance = require('node-binance-api');
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

var gauss = require('gauss');

var dyn = new AWS.DynamoDB({apiVersion: '2012-08-10'});

var timeoutOrder = 10000;
var timeoutCheck = 30000;
var timeoutMonitor = 30000;
var timeoutConfig = 60000;
var numberOfKandles = 10;
var debug = false;
// var emaL = 90;
// var emaM = 25;
// var emaS = 7;

var config = function () {
    var params = {
        TableName: 'Config',
        Key: {
          'symbol' : {S: 'BitBot'},
        }
      };
      
    // Call DynamoDB to read the item from the table
    dyn.getItem(params, function(err, data) {

        if (err) {
            console.log("Error", err);
        } else {

            timeoutOrder = parseInt(data.Item.timeoutOrder.N);
            timeoutCheck = parseInt(data.Item.timeoutCheck.N);
            timeoutMonitor = parseInt(data.Item.timeoutMonitor.N);
            numberOfKandles = parseInt(data.Item.numberOfKandles.N);
            debug = data.Item.debug.BOOL;
            // emaL = parseInt(data.Item.emaL.N);
            // emaM = parseInt(data.Item.emaM.N);
            // emaS = parseInt(data.Item.emaS.N);

            setTimeout(config, timeoutConfig);

        }
    });        
}
config();

var coin = {
    // coin specific variables
    symbol : '',
    quantity : 0.00,
    minGain : 0.00,
    maxGain : 0.00,
    maxLoss : 0.00,
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
    bids : [{
        id : '',
        qty : 0.00,
        value : 0.0000 
    }, {
        id : '',
        qty: 0.00,
        value: 0.0000
    }],
    asks : [{
        id : '',
        qty : 0.00,
        value : 0.0000 
    }, {
        id : '',
        qty: 0.00,
        value: 0.0000
    }],
    // commom variables
    // qty : 0.00,
    // bidOpen : false,
    // askOpen : false,
    // bidValue : 0.0000,
    // askValue : 0.0000,
    // bidOrderId : '',
    // askOrderId : '',
    done : 0,
    init : false,
    trading : false,
    direction : ''
}

var log = function (coin, type, message = '') {
    var now = new Date();
    console.log(now.toISOString()+' ('+type+') '+message);
}

var saveGain = function (coin) {

    try {
        var totalBuy = (coin.bids[0].value * coin.bids[0].qty) + (coin.bids[1].value * coin.bids[1].qty);
        var totalSell = (coin.asks[0].value * coin.asks[0].qty) + (coin.asks[1].value * coin.asks[1].qty);
                            
        var gain = totalSell - totalBuy;
        var fee = ((totalSell * (coin.fee / 100)) + (totalBuy * (coin.fee / 100))) * -1;
        var net = gain + fee;
    
        var params = {
            TableName: 'Trade',
            Item: {
              'datetime' : {S: new Date().toISOString()},
              'symbol' : {S: coin.symbol},
              'qty' : {N: coin.quantity.toFixed(coin.lot.stepPlaces)},
              'bidTotal' : {N: totalBuy.toFixed(coin.price.tickPlaces)},
              'askTotal' : {N: totalSell.toFixed(coin.price.tickPlaces)},
              'grossGain' : {N: gain.toFixed(coin.price.tickPlaces)},
              'fee' : {N: fee.toFixed(coin.price.tickPlaces)},
              'netGain' : {N: net.toFixed(coin.price.tickPlaces)}
            }
        };
          
        dyn.putItem(params, function(err, data) {
            try {
                if (err) { throw err };
            } catch (error) {
                log(coin, 'error', 'saveGain error '+error.message);
            }
        });

        coin.trading = false;

    } catch (error) {
        log(coin, 'error', 'saveGain error '+error.message);
    }

}

var hasNewBid = function (coin, bid, myBidPrice, callback) {

    if (coin.done == 0) {

        if (myBidPrice == bid.value) { return; }
        myBidPrice += coin.price.tickSize;

        bid.value = myBidPrice;

        coin.asks[0].value = myBidPrice * (1 + (coin.minGain / 100));
        coin.asks[1].value = coin.asks[0].value * (1 + (coin.maxGain / 100));

        callback('new_bid');
        return;

    } else if (coin.done == 1) {

        myBidPrice += coin.price.tickSize;

        var loss = ((coin.asks[0].value / myBidPrice) - 1) * -100;
        if (loss >= coin.maxLoss) {
            bid.value = myBidPrice;
            bid.qty = coin.quantity;
            coin.bids[1].value = 0;
            callback('new_bid');
        }
    } else if (coin.done == 2) {

        myBidPrice += coin.price.tickSize;

        var loss = ((coin.bids[0].value / myBidPrice) - 1) * -100;
        if (loss >= coin.maxLoss) {
            bid.value = myBidPrice;
            callback('new_bid');
        }
    }
}

var checkBid = function (coin, bid) {

    if (!coin.trading) { return; }

    binance.orderStatus(coin.symbol, bid.id, function(json) {

        try {
            
            if (!json) { throw new Error('Invalid API order status json'); }

            if (json.status == 'FILLED') {

                bid.value = parseFloat(json.price);
                
                coin.done++;
                log(coin, 'BOUGHT', 
                    'qty: ' + bid.qty.toFixed(coin.lot.stepPlaces) +
                    ' value: ' + bid.value.toFixed(coin.price.tickPlaces));

                if (coin.done == 1) {
                    doAsk(coin, coin.asks[0], function() {});
                }
                else if (coin.done == 2) {
                    if (coin.bids[1].value > 0) {
                        doBid(coin, coin.bids[1], function() {});
                    } else {
                        saveGain(coin);
                    }
                }
                else if (coin.done == 3) {
                    saveGain(coin);
                    // coin.bidOpen = false;

                }

            } else if (json.status == 'PARTIALLY_FILLED') {

                setTimeout(checkBid, timeoutOrder, coin, bid);
                return;
                // log(coin, '* BOUGHT PART', 'qty: '+coin.bidPartialQty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces));

            } else {

                binance.bookTicker(coin.symbol, function(bookTicker, symbol)  {
                
                    try {

                        if (!bookTicker) { throw new Error('Invalid API bookTicker'); }
                        if ( typeof bookTicker.msg !== "undefined" ) { throw new Error('Invalid API bookTicker'); }
                        
                        var bidPrice = parseFloat(bookTicker.bidPrice);

                        hasNewBid(coin, bid, bidPrice, function (action) {

                            if (action == 'new_bid') {

                                binance.cancel(coin.symbol, bid.id, function(cancel, symbol) {

                                    try {                                        
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        binance.buy(coin.symbol, bid.qty.toFixed(coin.lot.stepPlaces), bid.value.toFixed(coin.price.tickPlaces), {}, function(buy) {
    
                                            try {
                                                if (!buy) { throw new Error('Invalid API buy response'); }
                                                if ( typeof buy.msg !== "undefined" ) { throw new Error(buy.msg); }
    
                                                bid.id = buy.orderId;
                                                if (bid.id == 'undefined') { throw new Error('Invalid bid order Id'); }
                                                
                                                // coin.bidOpen = true;
    
                                            } catch (error) {
                                                log(coin, 'error', 'checkBid.buy qty: '+bid.qty.toFixed(coin.lot.stepPlaces)+' value: '+bid.value.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                            }
                                        });
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkBid.cancel bid order ' + bid.id + 
                                                ' qty: ' + bid.qty.toFixed(coin.lot.stepPlaces) + 
                                                ' value: ' + bid.value.toFixed(coin.price.tickPlaces) + 
                                                ' error: ' + error.message);
                                        }
                                    }
                                });
                            }

                        });

                        setTimeout(checkBid, timeoutOrder, coin, bid);

                    } catch (error) {
                        log(coin, 'error', 'checkBid.bookTicker() error: ' + error.message);
                        setTimeout(checkBid, timeoutOrder, coin, bid);
                    }

                });

            }
        } catch (error) {
            log(coin, 'error', 'checkBid.orderStatus() bid order ' + bid.id +
                ' error: ' + error.message);

            setTimeout(checkBid, timeoutOrder, coin, bid);
        }
    });

}

var doBid = function (coin, bid, callback) {

    if (!coin.trading) { return; }

    // Send bid order
    binance.buy(coin.symbol, bid.qty.toFixed(coin.lot.stepPlaces), bid.value.toFixed(coin.price.tickPlaces), {}, function(response) {
        
        try {
            
            if (!response) { throw new Error('Invalid API buy response'); }
            if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }

            bid.id = response.orderId;
            if (bid.id == 'undefined') { throw new Error('Invalid bid order Id'); }

            // log(coin, 'started', 'bid order '+coin.bidOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces));

            callback();

            checkBid(coin, bid);

        } catch (error) {
            // coin.bidOpen = false;
            log(coin, 'error', 'doBid() qty: '+bid.qty.toFixed(coin.lot.stepPlaces)+' value: '+bid.value.toFixed(coin.price.tickPlaces)+' error: '+error.message);
        }
    });

}


var hasNewAsk = function (coin, ask, myAskPrice, callback) {

    if (coin.done == 0) {

        if (myAskPrice == ask.value) { return; }
        myAskPrice -= coin.price.tickSize;

        ask.value = myAskPrice;

        coin.bids[0].value = myAskPrice / (1 + (coin.minGain / 100));
        coin.bids[1].value = coin.bids[0].value / (1 + (coin.maxGain / 100));

        callback('new_ask');
        return;

    } else if (coin.done == 1) {

        myAskPrice -= coin.price.tickSize;

        var loss = ((myAskPrice / coin.bids[0].value) - 1) * -100;
        if (loss >= coin.maxLoss) {
            ask.value = myAskPrice;
            ask.qty = coin.quantity;
            coin.asks[1].value = 0;
            callback('new_ask');
        }

    } else if (coin.done == 2) {

        myAskPrice -= coin.price.tickSize;

        var loss = ((myAskPrice / coin.asks[0].value) - 1) * -100;
        if (loss >= coin.maxLoss) {
            ask.value = myAskPrice;
            callback('new_ask');
        }

    }
}

var checkAsk = function (coin, ask) {

    if (!coin.trading) { return; }

    binance.orderStatus(coin.symbol, ask.id, function(json) {

        try {

            if (!json) { throw new Error('Invalid API order status json'); }

            if (json.status == 'FILLED') {

                ask.value = parseFloat(json.price);

                coin.done++;
                log(coin, 'SOLD', 'qty: ' + ask.qty.toFixed(coin.lot.stepPlaces) + 
                    ' value: ' + ask.value.toFixed(coin.price.tickPlaces));

                if (coin.done == 1) {
                    doBid(coin, coin.bids[0], function() {});
                }
                else if (coin.done == 2) {
                    if (coin.asks[1].value > 0) {
                        doAsk(coin, coin.asks[1], function() {});
                    } else {
                        saveGain(coin);
                    }
                }
                else if (coin.done == 3) {
                    saveGain(coin);
                }

            } else if (json.status == 'PARTIALLY_FILLED') {

                setTimeout(checkAsk, timeoutOrder, coin, ask);
                return;
                // log(coin, '* SOLD PART', 'qty: '+coin.askPartialQty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces));

            } else {

                binance.bookTicker(coin.symbol, function(bookTicker, symbol)  {
                
                    try {

                        if (!bookTicker) { throw new Error('Invalid API bookTicker'); }
                        if ( typeof bookTicker.msg !== "undefined" ) { throw new Error('Invalid API bookTicker'); }

                        var askPrice = parseFloat(bookTicker.askPrice);

                        hasNewAsk(coin, ask, askPrice, function (action) {

                            if (action == 'new_ask') {

                                binance.cancel(coin.symbol, ask.id, function(cancel, symbol) {

                                    try {
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        binance.sell(coin.symbol, ask.qty.toFixed(coin.lot.stepPlaces), ask.value.toFixed(coin.price.tickPlaces), {}, function(sell) {
    
                                            try {
                                                if (!sell) { throw new Error('Invalid API sell response'); }
                                                if ( typeof sell.msg !== "undefined" ) { throw new Error(sell.msg); }
    
                                                ask.id = sell.orderId;
                                                if (ask.id == 'undefined') { throw new Error('Invalid ask order Id'); }
                                                
                                                // coin.askOpen = true;
    
                                            } catch (error) {
                                                log(coin, 'error', 'checkAsk.sell() qty: '+ask.qty.toFixed(coin.lot.stepPlaces)+' value: '+ask.value.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                            }
                                        });
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkAsk.cancel() ask order ' + ask.id + 
                                                ' qty: ' + ask.qty.toFixed(coin.lot.stepPlaces) + 
                                                ' value: ' + ask.value.toFixed(coin.price.tickPlaces) + 
                                                ' error: ' + error.message);
                                        }
                                    }
                                });
                            } 

                        });

                        setTimeout(checkAsk, timeoutOrder, coin, ask);


                    } catch (error) {
                        log(coin, 'error', 'checkAsk.bookTicker() error: '+error.message);
                        setTimeout(checkAsk, timeoutOrder, coin, ask);
                    }

                });

            }

        } catch (error) {
            log(coin, 'error', 'checkAsk.orderStatus ask order ' + ask.id + 
                ' error: '+error.message);

            setTimeout(checkAsk, timeoutOrder, coin, ask);
        }
    });

}  

var doAsk = function (coin, ask, callback) {

    if (!coin.trading) { return; }

    // Send ask order
    binance.sell(coin.symbol, ask.qty.toFixed(coin.lot.stepPlaces), ask.value.toFixed(coin.price.tickPlaces), {}, function(response) {
        
        try {

            if (!response) { throw new Error('Invalid API sell response'); }
            if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
            
            ask.id = response.orderId;
            if (ask.id == 'undefined') { throw new Error('Invalid ask order Id'); }

            // log(coin, 'started', 'ask order '+coin.askOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces));

            callback();

            checkAsk(coin, ask);
            
        } catch (error) {
            // coin.askOpen = false;
            log(coin, 'error', 'doAsk() qty: '+ask.qty.toFixed(coin.lot.stepPlaces)+' value: '+ask.value.toFixed(coin.price.tickPlaces)+' error: '+error.message);
        }

    });
            
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

var bitbot = function (coin) {

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

                setTimeout(bitbot, timeoutCheck, coin);

            } catch (error) {
                log(coin, 'error', 'bitbot.exchangeInfo '+error.message);
            }
        });

    } else {

        if (coin.trading) {
            setTimeout(bitbot, timeoutCheck, coin);
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
                console.log("Error", err);
            } else {

                coin.quantity = parseFloat(data.Item.quantity.N);

                if (coin.quantity < coin.lot.minQty || coin.quantity > coin.lot.maxQty) { throw new Error('invalid qty value: '+coin.quantity); }

                coin.minGain = parseFloat(data.Item.minGain.N);
                coin.maxGain = parseFloat(data.Item.maxGain.N);
                coin.maxLoss = parseFloat(data.Item.maxLoss.N);
                coin.fee = parseFloat(data.Item.fee.N);

                var pause = parseInt(data.Item.pause.N);
                if (pause) {
                    log(coin, 'pause');
                    setTimeout(bitbot, timeoutCheck, coin);
                    return;
                }

                // Getting latest price of a symbol
                binance.bookTicker(coin.symbol, function(bookTicker, symbol)  {

                    try {

                        if (!bookTicker) { throw new Error('Invalid API bookTicker'); }

                        var bidPrice = parseFloat(bookTicker.bidPrice);
                        var askPrice = parseFloat(bookTicker.askPrice);;

                        coin.trading = false;
                        coin.done = 0;

                        // coin.qty = coin.quantity;

                        if (monitor2.direction == 'buy') {

                            coin.trading = true;

                            coin.bids[0].qty = coin.quantity;
                            coin.bids[0].value = bidPrice + coin.price.tickSize;

                            coin.bids[1].qty = 0.00;
                            coin.bids[1].value = 0.00;

                            // coin.bidValue = bidPrice + coin.price.tickSize;

                            coin.asks[0].qty = coin.quantity / 2;
                            coin.asks[0].value = coin.bids[0].value * (1 + (coin.minGain / 100));

                            coin.asks[1].qty = coin.quantity / 2;
                            coin.asks[1].value = coin.asks[0].value * (1 + (coin.maxGain / 100));

                            // coin.askValue = coin.bidValue * (1 + (coin.minGain / 100));

                            doBid(coin, coin.bids[0], function() {});

                            log(coin, 'buying', 'qty: ' + coin.bids[0].qty.toFixed(coin.lot.stepPlaces) + 
                                ' bid: ' + coin.bids[0].value.toFixed(coin.price.tickPlaces) +
                                ' ask1: ' + coin.asks[0].value.toFixed(coin.price.tickPlaces) +
                                ' ask2: ' + coin.asks[1].value.toFixed(coin.price.tickPlaces));

                        } else if (monitor2.direction == 'sell') {

                            coin.trading = true;

                            coin.asks[0].qty = coin.quantity;
                            coin.asks[0].value = askPrice - coin.price.tickSize;

                            coin.asks[1].qty = 0.00;
                            coin.asks[1].value = 0.00;

                            // coin.askValue = askPrice - coin.price.tickSize;

                            coin.bids[0].qty = coin.quantity / 2;
                            coin.bids[0].value = coin.asks[0].value / (1 + (coin.minGain / 100));

                            coin.bids[1].qty = coin.quantity / 2;
                            coin.bids[1].value = coin.bids[0].value / (1 + (coin.maxGain / 100));

                            // coin.bidValue = coin.askValue / (1 + (coin.minGain / 100));

                            doAsk(coin, coin.asks[0], function() {});

                            log(coin, 'selling', 'qty: '+coin.asks[0].qty.toFixed(coin.lot.stepPlaces) + 
                                ' ask: '+coin.asks[0].value.toFixed(coin.price.tickPlaces) +
                                ' bid1: ' + coin.bids[0].value.toFixed(coin.price.tickPlaces) +
                                ' bid2: ' + coin.bids[1].value.toFixed(coin.price.tickPlaces));

                        } else {
                            // log(coin, 'trading', 'direction: '+direction);
                        }

                        setTimeout(bitbot, timeoutCheck, coin);

                    } catch (error) {
                        log(coin, 'error', 'bitbot.bookTicker error: '+error.message);
                        setTimeout(bitbot, timeoutCheck, coin);
                    }
                });

            }
        });
    }
}

var GetMarketInfo = function (symbol, interval, callback) {

    binance.candlesticks(symbol, interval, function(klines) {

        var avgs = 0.00;

//        var close = [];

        for (var i=0; i<klines.length; i++) {

            var high = parseFloat(klines[i][2]);
            var low = parseFloat(klines[i][3]);
            var avg = (high + low) / 2;

//            kline = parseFloat(klines[i][4]);
//            close[i] = kline;
            avgs += avg;
        }

        avgs /= 10;

        // var vec = close.toVector();
        // var arrEmaS = vec.ema(emaS);
        // var arrEmaM = vec.ema(emaM);
//        var arrEmaL = vec.ema(emaL);

        // var retEmaS = arrEmaS[arrEmaS.length-1];
        // var retEmaM = arrEmaM[arrEmaM.length-1];
//        var retEmaL = arrEmaL[arrEmaL.length-1];
        // var retEmaL = 0;

        callback(avgs);

    }, {'limit' : 10} );
}

var monitor2 = {
    direction : '',
    init : function (coin) {

        var symbol = coin.symbol;

        GetMarketInfo(symbol, '1m', function (avgs) {

            // GetMarketInfo(symbol, '5m', function (emaS5m, emaM5m, emaL5m) {
            
                binance.price(symbol, function(price) {

                    var price = parseFloat(price.price);

                    if ((avgs * 1.005) < price) {
                        monitor2.direction = 'buy';
                    } else if ((avgs / 1.005) > price) {
                        monitor2.direction = 'sell';
                    } else {
                        monitor2.direction = 'nothing';
                    }

                    if (!coin.init) { 
                        bitbot(coin); 
                    }

                    if (debug) {
                        console.log(
                            new Date().toISOString() + '\t' +
                            avgs.toFixed(2) + '\t' +
                            price.toFixed(2) + '\t' +
                            monitor2.direction);
                    }
        
                    setTimeout(monitor2.init, timeoutMonitor, coin);

                });
            // });
        });

    }    
}

if (process.argv.length > 2) {

    var coinSymbol = process.argv[2];

    if (coinSymbol == 'BNBUSDT' || coinSymbol == 'BTCUSDT') {

        coin.symbol = coinSymbol;
        console.log('Initializing BitBot: '+coinSymbol);
        monitor2.init(coin);

    } else {

        console.log('Invalid coin: '+coinSymbol);
        process.exit(0);

    }
} else {

    console.log('Use: node main.js <coin>');
    process.exit(0);

}
