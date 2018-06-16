'use strict';

var config = require('./config');
const binance = require('node-binance-api');
binance.options({
  'APIKEY': config.binance.apiKey,
  'APISECRET': config.binance.secretKey
});


var AWS = require('aws-sdk');
// AWS.config.update({ region: "sa-east-1" });
// var dyn = new AWS.DynamoDB({ endpoint: new AWS.Endpoint('http://localhost:8000') });
AWS.config.update({ 
    accessKeyId: config.aws.accessKeyId, 
    secretAccessKey: config.aws.secretAccessKey, 
    region: 'sa-east-1'
});

var dyn = new AWS.DynamoDB({apiVersion: '2012-08-10'});

// binance.allOrders('BNBUSDT', function(data, symbol) {
//     try {
//         console.log(data);
//         console.log(symbol);
//     } catch (error) {
//         console.log(error.message);
//     }
// }, 10);

var timeoutOrder = 5000;
var timeoutCheck = 10000;
var timeoutMonitor = 60000;
var timeoutConfig = 60000;
var numberOfKandles = 30;

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

            setTimeout(config, timeoutConfig);

        }
    });        
}
config();

var coinArr = [ {
    id : 0,
    // coin specific variables
    symbol : '',
    minQty : 0.00,
    maxQty : 0.00,
    minGain : 0.00,
    // coin exchange variables
    status : '',
//    baseAsset: '',
//    quoteAsset: '',
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0, stepPlaces: 0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0, tickPlaces: 0 },
    minNotional : 0.0,
    // commom variables
    qty : 0.00,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.0000,
    askValue : 0.0000,
    bidOrderId : '',
    askOrderId : '',
    done : 0,
    init : false,
    direction : ''
}, {
    id : 1,
    // coin specific variables
    symbol : '',
    minQty : 0.00,
    maxQty : 0.00,
    minGain : 0.00,
    // coin exchange variables
    status : '',
//    baseAsset: '',
//    quoteAsset: '',
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0, stepPlaces: 0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0, tickPlaces: 0 },
    minNotional : 0.0,
    // commom variables
    qty : 0.00,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.0000,
    askValue : 0.0000,
    bidOrderId : '',
    askOrderId : '',
    done : 0,
    init : false,
    direction : ''
}]

var generateQuantity = function (coin) {
    return parseFloat((Math.random() * (coin.maxQty - coin.minQty) + coin.minQty).toFixed(coin.lot.stepPlaces));
}   

var log = function (coin, type, message = '') {
    var now = new Date();
    console.log(now.toISOString()+' '+coin.id+' ('+type+') '+message);
}

var isValidPrice = function (coin, price) {
    return (price >= coin.price.minPrice && price <= coin.price.maxPrice);
}

var isValidQty = function (coin, qty) {
    return (qty >= coin.lot.minQty && qty <= coin.lot.maxQty);
}

var isValidNotional = function(coin, qty, value) {
    return (qty * value > coin.minNotional)
}

var saveGain = function (coin) {

    try {
        var totalBuy = coin.bidValue * coin.qty;
        var totalSell = coin.askValue * coin.qty;
                            
        var gain = totalSell - totalBuy;
        var fee = ((totalSell * 0.0005) + (totalBuy * 0.0005)) * -1;
        var net = gain + fee;
    
        var params = {
            TableName: 'Trade',
            Item: {
              'datetime' : {S: new Date().toISOString()},
              'symbol' : {S: coin.symbol},
              'bidPrice' : {N: coin.bidValue.toFixed(coin.price.tickPlaces)},
              'askPrice' : {N: coin.askValue.toFixed(coin.price.tickPlaces)},
              'qty' : {N: coin.qty.toFixed(coin.lot.stepPlaces)},
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
    } catch (error) {
        log(coin, 'error', 'saveGain error '+error.message);
    }

}

var hasNewBid = function (coin, myBidPrice, callback) {

    if (coin.done == 0) {

        if (monitor2.direction != 'buy') { 
            callback('cancel'); 
            return; 
        }

        if (myBidPrice == coin.bidValue) { return; }
        myBidPrice += coin.price.tickSize;

        coin.bidValue = myBidPrice;
        coin.askValue = myBidPrice * (1+(coin.minGain/100));
        callback('new_bid');
        return;

    } else {

        myBidPrice += coin.price.tickSize;

        var loss = ((coin.askValue / myBidPrice) - 1) * -100;
        if (loss >= coin.maxLoss) {
            coin.bidValue = myBidPrice;
            callback('new_bid');
        }

    }
}

var checkBid = function (coin) {

    if (!coin.bidOpen) { return; }

    binance.orderStatus(coin.symbol, coin.bidOrderId, function(json) {

        try {
            
            if (!json) { throw new Error('Invalid API order status json'); }

            var gain = 0.0;

            if (json.status == 'FILLED') {

                coin.bidValue = parseFloat(json.price);
                
                gain = ((coin.askValue / coin.bidValue) - 1) * 100;

                coin.done++;
                log(coin, '* BOUGHT', 'qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+(coin.done==2?' gain: '+gain.toFixed(2):''));

                if (coin.done == 1) {
                    doAsk(coin, function() {
                        coin.bidOpen = false;
                    });
                }
                else if (coin.done == 2) {
                    saveGain(coin);
                    coin.bidOpen = false;
                }

            } else if (json.status == 'PARTIALLY_FILLED') {

                setTimeout(checkBid, timeoutOrder, coin);
                return;
                // log(coin, '* BOUGHT PART', 'qty: '+coin.bidPartialQty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces));

            } else {

                binance.bookTicker(coin.symbol, function(bookTicker, symbol)  {
                
                    try {

                        if (!bookTicker) { throw new Error('Invalid API bookTicker'); }
                        if ( typeof bookTicker.msg !== "undefined" ) { throw new Error('Invalid API bookTicker'); }
                        
                        var bidPrice = parseFloat(bookTicker.bidPrice);

                        hasNewBid(coin, bidPrice, function (action) {

                            if (action == 'cancel') {

                                binance.cancel(coin.symbol, coin.bidOrderId, function(cancel, symbol) {

                                    try {
                                        
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        coin.bidOpen = false;
                                        return;
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkBid.cancel bid order '+coin.bidOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                        }
                                    }

                                });
                                    
                            } else if (action == 'new_bid') {

                                binance.cancel(coin.symbol, coin.bidOrderId, function(cancel, symbol) {

                                    try {                                        
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        binance.buy(coin.symbol, coin.qty.toFixed(coin.lot.stepPlaces), coin.bidValue.toFixed(coin.price.tickPlaces), {}, function(buy) {
    
                                            try {
                                                if (!buy) { throw new Error('Invalid API buy response'); }
                                                if ( typeof buy.msg !== "undefined" ) { throw new Error(buy.msg); }
    
                                                coin.bidOrderId = buy.orderId;
                                                if (coin.bidOrderId == 'undefined') { throw new Error('Invalid bid order Id'); }
                                                
                                                coin.bidOpen = true;
    
                                            } catch (error) {
                                                log(coin, 'error', 'checkBid.buy qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                            }
                                        });
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkBid.cancel bid order '+coin.bidOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                        }
                                    }
                                });
                            }

                        });

                        setTimeout(checkBid, timeoutOrder, coin);

                    } catch (error) {
                        log(coin, 'error', 'checkBid.bookTicker '+error.message);
                        setTimeout(checkBid, timeoutOrder, coin);
                    }

                });

            }
        } catch (error) {
            log(coin, 'error', 'checkBid.orderStatus bid order '+coin.bidOrderId+' error: '+error.message);
            setTimeout(checkBid, timeoutOrder, coin);
        }
    });

}

var hasNewAsk = function (coin, myAskPrice, callback) {

    if (coin.done == 0) {

        if (monitor2.direction != 'sell') { 
            callback('cancel'); 
            return; 
        }

        if (myAskPrice == coin.askValue) { return; }
        myAskPrice -= coin.price.tickSize;

        coin.askValue = myAskPrice;
        coin.bidValue = myAskPrice / (1+(coin.minGain/100));
        callback('new_ask');
        return;

    } else {

        myAskPrice -= coin.price.tickSize;

        var loss = ((myAskPrice / coin.bidValue) - 1) * -100;
        if (loss >= coin.maxLoss) {
            coin.askValue = myAskPrice;
            callback('new_ask');
        }

    }
}

var checkAsk = function (coin) {

    if (!coin.askOpen) { return; }

    binance.orderStatus(coin.symbol, coin.askOrderId, function(json) {

        try {

            if (!json) { throw new Error('Invalid API order status json'); }

            var gain = 0.0;

            if (json.status == 'FILLED') {

                coin.askValue = parseFloat(json.price);

                gain = ((coin.askValue / coin.bidValue) - 1) * 100;

                coin.done++;
                log(coin, '* SOLD ', 'qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces)+(coin.done==2?' gain: '+gain.toFixed(2):''));

                if (coin.done == 1) {
                    doBid(coin, function() {
                        coin.askOpen = false;
                    });
                }
                else if (coin.done == 2) {
                    saveGain(coin);
                    coin.askOpen = false;
                }

            } else if (json.status == 'PARTIALLY_FILLED') {

                setTimeout(checkAsk, timeoutOrder, coin);
                return;
                // log(coin, '* SOLD PART', 'qty: '+coin.askPartialQty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces));

            } else {

                binance.bookTicker(coin.symbol, function(bookTicker, symbol)  {
                
                    try {

                        if (!bookTicker) { throw new Error('Invalid API bookTicker'); }
                        if ( typeof bookTicker.msg !== "undefined" ) { throw new Error('Invalid API bookTicker'); }

                        var askPrice = parseFloat(bookTicker.askPrice);

                        hasNewAsk(coin, askPrice, function (action) {

                            if (action == 'cancel') {

                                binance.cancel(coin.symbol, coin.askOrderId, function(cancel, symbol) {

                                    try {
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        coin.askOpen = false;
                                        return;
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkAsk.cancel bid order '+coin.bidOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                        }

                                    }
                                });

                            } else if (action == 'new_ask') {

                                binance.cancel(coin.symbol, coin.askOrderId, function(cancel, symbol) {

                                    try {
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        
                                        binance.sell(coin.symbol, coin.qty.toFixed(coin.lot.stepPlaces), coin.askValue.toFixed(coin.price.tickPlaces), {}, function(sell) {
    
                                            try {
                                                if (!sell) { throw new Error('Invalid API sell response'); }
                                                if ( typeof sell.msg !== "undefined" ) { throw new Error(sell.msg); }
    
                                                coin.askOrderId = sell.orderId;
                                                if (coin.askOrderId == 'undefined') { throw new Error('Invalid ask order Id'); }
                                                
                                                coin.askOpen = true;
    
                                            } catch (error) {
                                                log(coin, 'error', 'checkAsk.sell() qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                            }
                                        });
    
                                    } catch (error) {
                                        if (!cancel && typeof cancel.msg !== "undefined" && cancel.msg != 'UNKNOWN_ORDER') {
                                            log(coin, 'error', 'checkAsk.cancel() ask order '+coin.askOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
                                        }
                                    }
                                });
                            } 

                        });

                        setTimeout(checkAsk, timeoutOrder, coin);


                    } catch (error) {
                        log(coin, 'error', 'checkAsk.depth '+error.message);
                        setTimeout(checkAsk, timeoutOrder, coin);
                    }

                });

            }

        } catch (error) {
            log(coin, 'error', 'checkAsk.orderStatus ask order '+coin.askOrderId+' error: '+error.message);
            setTimeout(checkAsk, timeoutOrder, coin);
        }
    });

}  

var doBid = function (coin, callback) {

    if (coin.done == 1 && monitor2.direction != 'buy') {
        setTimeout(doBid, timeoutOrder, coin, callback);
        return;
    }

    if (!coin.bidOpen) {

        // Send bid order
        binance.buy(coin.symbol, coin.qty.toFixed(coin.lot.stepPlaces), coin.bidValue.toFixed(coin.price.tickPlaces), {}, function(response) {
            
            try {
                
                if (!response) { throw new Error('Invalid API buy response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }

                coin.bidOrderId = response.orderId;
                if (coin.bidOrderId == 'undefined') { throw new Error('Invalid bid order Id'); }

                coin.bidOpen = true;
                // log(coin, 'started', 'bid order '+coin.bidOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces));

                callback();

                checkBid(coin);

            } catch (error) {
                log(coin, 'error', 'doOrder.buy() qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
            }
        });
    }
}

var doAsk = function (coin, callback) {

    if (coin.done == 1 && monitor2.direction != 'sell') {
        setTimeout(doAsk, timeoutOrder, coin, callback);
        return;
    }

    if (!coin.askOpen) {

        // Send ask order
        binance.sell(coin.symbol, coin.qty.toFixed(coin.lot.stepPlaces), coin.askValue.toFixed(coin.price.tickPlaces), {}, function(response) {
            
            try {

                if (!response) { throw new Error('Invalid API sell response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
                
                coin.askOrderId = response.orderId;
                if (coin.askOrderId == 'undefined') { throw new Error('Invalid ask order Id'); }

                coin.askOpen = true;
                // log(coin, 'started', 'ask order '+coin.askOrderId+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces));

                callback();

                checkAsk(coin);
                
            } catch (error) {
                log(coin, 'error', 'doOrder.sell() qty: '+coin.qty.toFixed(coin.lot.stepPlaces)+' value: '+coin.askValue.toFixed(coin.price.tickPlaces)+' error: '+error.message);
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
                // coin.baseAsset = infoCoin.baseAsset;
                // coin.quoteAsset = infoCoin.quoteAsset;

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'PRICE_FILTER';
                })
                var infoPriceFilter = searchFilter[0];
                coin.price.minPrice = parseFloat(infoPriceFilter.minPrice);
                coin.price.maxPrice = parseFloat(infoPriceFilter.maxPrice);
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

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'MIN_NOTIONAL';
                })
                var infoNotionalFilter = searchFilter[0];

                coin.minNotional = parseFloat(infoNotionalFilter.minNotional);

                if (coin.status == 'TRADING') {
                    coin.init = true;
                } else {
                    throw new Error('status '+coin.status);
                }
                setTimeout(bitbot, timeoutCheck, coin);
            } catch (error) {
                log(coin, 'error', 'bitbot.exchangeInfo '+error.message);
                setTimeout(bitbot, timeoutCheck, coin);
            }
        });

    } else {

        if (coin.bidOpen || coin.askOpen) {
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

                coin.minQty = parseFloat(data.Item.minQty.N);
                coin.maxQty = parseFloat(data.Item.maxQty.N);

                if (coin.minQty < coin.lot.minQty) { throw new Error('invalid min qty value: '+coin.minQty); }
                if (coin.maxQty > coin.lot.maxQty) { throw new Error('invalid max qty value: '+coin.maxQty); }

                coin.minGain = parseFloat(data.Item.minGain.N);
                coin.maxLoss = parseFloat(data.Item.maxLoss.N);
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

                        coin.done = 0;

                        coin.qty = generateQuantity(coin);

                        var direction = monitor2.direction;

                        if (direction == 'buy' && coin.direction == 'buy') {

                            coin.bidValue = bidPrice + coin.price.tickSize;
                            coin.askValue = coin.bidValue * (1 + (coin.minGain / 100));

                            doBid(coin, function() {});
                            log(coin, 'trading', 'buying: '+coin.bidValue.toFixed(coin.price.tickPlaces)+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces));

                        } else if (direction == 'sell' && coin.direction == 'sell') {

                            coin.askValue = askPrice - coin.price.tickSize;
                            coin.bidValue = coin.askValue / (1 + (coin.minGain / 100));

                            doAsk(coin, function() {});
                            log(coin, 'trading', 'selling: '+coin.askValue.toFixed(coin.price.tickPlaces)+' qty: '+coin.qty.toFixed(coin.lot.stepPlaces));

                        } else {
                            // log(coin, 'trading', 'direction: '+direction);
                        }

                        setTimeout(bitbot, timeoutCheck, coin);

                    } catch (error) {
                        log(coin, 'error', 'bitbot.depth error: '+error.message);
                        setTimeout(bitbot, timeoutCheck, coin);
                    }
                });

            }
        });
    }
}

var monitor2 = {
    recentPrices : 0.00,
    oldPrices : 0.00,
    percAvg : 0.00,
    direction : '',
    lastDirection : '',
    id : 0,
    init : function (coinArray) {

        var symbol = coinArray[0].symbol;

        binance.candlesticks(symbol, '1m', function(trades) {

            monitor2.recentPrices = 0.00;
            monitor2.oldPrices = 0.00;

            for (var i=0; i<trades.length; i++) {
                if (i>=(numberOfKandles/2)) {
                    monitor2.recentPrices += parseFloat(trades[i][4]);
                } else {
                    monitor2.oldPrices += parseFloat(trades[i][4]);
                }
            }

            monitor2.recentPrices /= (numberOfKandles/2);
            monitor2.oldPrices /= (numberOfKandles/2);
            monitor2.percAvg = ((monitor2.recentPrices / monitor2.oldPrices) - 1) * 100;
            monitor2.direction = 'nothing';

            if (monitor2.id > 0) {

                if (monitor2.percAvg < 0) {
                    
                    monitor2.direction = 'sell';

                    if (!coinArray[0].init) { 
                        coinArray[0].direction = 'sell';
                        bitbot(coinArray[0]); 
                    }
                    
                // } else if (monitor2.oldPrices <= monitor2.lastOld && monitor2.recentPrices >= monitor2.lastRecent) {
                } else if (monitor2.percAvg > 0) {

                    monitor2.direction = 'buy';

                    if (!coinArray[1].init) { 
                        coinArray[1].direction = 'buy';
                        bitbot(coinArray[1]); 
                    }

                } else {
                    monitor2.direction = monitor2.lastDirection;
                }
            }

            console.log(
                new Date().toISOString()+' ; '+
                monitor2.oldPrices.toFixed(4)+' ; '+
                monitor2.recentPrices.toFixed(4)+' ; '+
                monitor2.percAvg.toFixed(4)+' ; '+
                monitor2.direction);
 
            monitor2.lastDirection = monitor2.direction;

            monitor2.id++;
            setTimeout(monitor2.init, timeoutMonitor, coinArray);

        }, {'limit' : numberOfKandles} );

    }    
}

var coinSymbol;
if (process.argv.length > 2) {
    coinSymbol = process.argv[2];

    if (coinSymbol == 'BNBUSDT' || coinSymbol == 'BTCUSDT') {
        coinArr[0].symbol = coinSymbol;
        coinArr[1].symbol = coinSymbol;

        console.log('Initializing BitBot: '+coinSymbol);

        monitor2.init(coinArr);
    } else {
        console.log('Invalid coin: '+coinSymbol);
        process.exit(0);
    }
} else {
    console.log('Use: node main.js <coin>');
    process.exit(0);
}
