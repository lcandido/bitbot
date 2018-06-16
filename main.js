'use strict';

var config = require('./config');
const binance = require('node-binance-api');
binance.options({
  'APIKEY': config.apiKey,
  'APISECRET': config.secretKey
});


// binance.allOrders('BNBUSDT', function(data, symbol) {
//     try {
//         console.log(data);
//         console.log(symbol);
//     } catch (error) {
//         console.log(error.message);
//     }
// }, 10);

var timeout = 1000;
var timeoutCheck = 5000;
var maxTries = 1800;
var depthLimit = 10;

var BNBUSDT = {
    // coin specific variables
    symbol : 'BNBUSDT',
    minQty : 5.0,
    maxQty : 8.0,
    minGain : 0.05,
    entryGain : 0.2,
    maxGain : 2,
    avg: { w1Ask: 0.5, w2Ask : 0.1, w1Bid: 0.5, w2Bid: 0.1 },
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    fixed : 0,
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0 },
    minNotional : 0.0,
    // commom variables
    bidQty : 0.0,
    askQty : 0.0,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.0000,
    askValue : 0.0000,
    bidOrderId : '',
    askOrderId : '',
    tryBids : 1,
    tryAsks : 1,
    done : 0,
    init : false
}

var LTCUSDT = {
    // coin specific variables
    symbol : 'LTCUSDT',
    minQty : 1,
    maxQty : 1,
    minGain : 0.05,
    entryGain : 0.2,
    maxGain : 2,
    avg: { w1Ask: 0.4, w2Ask : 0.15, w1Bid: 0.4, w2Bid: 0.15 },
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    fixed : 0,
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0 },
    minNotional : 0.0,
    // commom variables
    bidQty : 0.0,
    askQty : 0.0,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.0000,
    askValue : 0.0000,
    bidOrderId : '',
    askOrderId : '',
    tryBids : 1,
    tryAsks : 1,
    done : 0,
    init : false
}

// BTCUSDT
var BTCUSDT = {
    // coin specific variables
    symbol : 'BTCUSDT',
    minQty : 0.01,
    maxQty : 0.01,
    minGain : 0.05,
    entryGain : 0.10,
    maxGain : 2,
    avg: { w1Ask: 0.15, w2Ask : 0.05, w1Bid: 0.15, w2Bid: 0.05 },
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    fixed : 0,
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0 },
    minNotional : 0.0,
    // commom variables
    bidQty : 0.0,
    askQty : 0.0,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.00,
    askValue : 0.00,
    bidOrderId : '',
    askOrderId : '',
    tryBids : 1,
    tryAsks : 1,
    done : 0,
    init : false
}

// LTCBNB
var LTCBNB = {
    // coin specific variables
    symbol : 'LTCBNB',
    minQty : 2,
    maxQty : 2,
    minGain : 0.10,
    entryGain : 0.20,
    maxGain : 2,
    avg: { w1Ask: 1, w2Ask : 0.25, w1Bid: 1, w2Bid: 0.25 },
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    fixed : 0,
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0 },
    minNotional : 0.0,
    // commom variables
    bidQty : 0.0,
    askQty : 0.0,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.00,
    askValue : 0.00,
    bidOrderId : '',
    askOrderId : '',
    tryBids : 1,
    tryAsks : 1,
    done : 0,
    init : false
}

// BNBBTC
var BNBBTC = {
    // coin specific variables
    symbol : 'BNBBTC',
    minQty : 4.00,
    maxQty : 4.40,
    minGain : 0.05,
    entryGain : 0.20,
    maxGain : 1.0,
    avg: { w1Ask: 0.25, w2Ask : 0.05, w1Bid: 0.25, w2Bid: 0.05 },
    // coin exchange variables
    status : '',
    baseAsset: '',
    quoteAsset: '',
    fixed : 0,
    lot : { minQty : 0.0, maxQty : 0.0, stepSize: 0.0 },
    price : { minPrice: 0.0, maxPrice: 0.0, tickSize: 0.0 },
    minNotional : 0.0,
    // commom variables
    bidQty : 0.0,
    askQty : 0.0,
    bidOpen : false,
    askOpen : false,
    bidValue : 0.00,
    askValue : 0.00,
    bidOrderId : '',
    askOrderId : '',
    tryBids : 1,
    tryAsks : 1,
    done : 0,
    init : false
}

var generateQuantity = function (coin) {
    return parseFloat((Math.random() * (coin.maxQty - coin.minQty) + coin.minQty).toFixed(2));
}

var log = function (coin, type, message) {
    var now = new Date();
    console.log(now.toLocaleString()+' '+coin.symbol+' ('+type+') '+message);
}

var cancelBid = function (coin) {

    try {
        binance.cancel(coin.symbol, coin.bidOrderId, function(response, symbol) {
            log(coin, 'cancel', 'bid order '+coin.bidOrderId+' qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed));
            coin.bidOpen = false;
            coin.tryBids = 1;
        });
    } catch (error) {
        log(coin, 'error', 'cancelBid.cancel() bid order '+coin.bidOrderId+' qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed)+' error: '+error.message);
    }

}

var cancelAsk = function (coin) {
    
    try {
        binance.cancel(coin.symbol, coin.askOrderId, function(response, symbol) {
            log(coin, 'cancel', 'ask order '+coin.askOrderId+' qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed));
            coin.askOpen = false;
            coin.tryAsks = 1;
        });
    } catch (error) {
        log(coin, 'error', 'cancelAsk.cancel() ask order '+coin.askOrderId+' qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed)+' error: '+error.message);
    }

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

var canGrowthBid = function (coin, depth) {

    var newBidPrice = 0.0;
    var newGain = 0.0;

    for ( let bid in depth.bids ) {
        newBidPrice = parseFloat(bid);
        newGain = ((coin.askValue / newBidPrice) - 1) * 100;

        if (newBidPrice > coin.bidValue && newGain > coin.minGain) {

            newBidPrice += coin.price.tickSize;
            if (isValidPrice(coin, newBidPrice)) {
                coin.bidValue = newBidPrice + coin.price.tickSize;
                return true;
            }
        }
    }

    return false;
}

var checkBid = function (coin) {

    if (!coin.bidOpen) { return; }

    if (coin.tryBids <= maxTries) {

        if (coin.done == 0 && coin.tryBids == maxTries) {
            cancelBid(coin);
            return;
        }

        var gain = ((coin.askValue / coin.bidValue) - 1) * 100;

        binance.orderStatus(coin.symbol, coin.bidOrderId, function(json) {

            try {
                
                if (!json) { throw new Error('Invalid API order status json'); }
                
                if (json.status == 'FILLED') {

                    log(coin, '* BOUGHT', 'bid order '+coin.bidOrderId+'. qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed)+' gain: '+gain.toFixed(2)+'%');
                    coin.tryBids = 1;
                    coin.bidOpen = false;
                    coin.done++;

                } else {

                    if (json.status == 'PARTIALLY_FILLED') {

                        var executedQty = parseFloat(json.executedQty);

                        coin.bidQty = coin.bidQty - executedQty;
                        if (!isValidQty(coin, coin.bidQty)) { 
                            setTimeout(checkBid, timeout, coin); 
                            return;
                        }
                    } 

                    binance.depth(coin.symbol, function(depth, symbol)  {
                    
                        try {

                            if (!depth) { throw new Error('Invalid API depth'); }
                            if ( typeof depth.bids == "undefined" ) { throw new Error('Invalid API depth'); }
                            
                            if (canGrowthBid(coin, depth)) {

                                binance.cancel(coin.symbol, coin.bidOrderId, function(cancel, symbol) {

                                    try {
                                        
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        if (!isValidNotional(coin, coin.bidQty, coin.bidValue)) { throw new Error('Invalid bid notional'); }
                                        
                                        binance.buy(coin.symbol, coin.bidQty.toFixed(2), coin.bidValue.toFixed(coin.fixed), {}, function(buy) {

                                            try {
                                                if (!buy) { throw new Error('Invalid API buy response'); }
                                                if ( typeof buy.msg !== "undefined" ) { throw new Error(buy.msg); }

                                                coin.bidOrderId = buy.orderId;
                                                if (coin.bidOrderId == 'undefined') { throw new Error('Invalid bid order Id'); }
                                                
                                                coin.bidOpen = true;

                                            } catch (error) {
                                                log(coin, 'error', 'checkBid.buy qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed)+' error: '+error.message);
                                            }
                                        });

                                    } catch (error) {
                                        log(coin, 'error', 'checkBid.cancel bid order '+coin.bidOrderId+' Qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed)+' error: '+error.message);
                                    }
                                });

                            }

                            log(coin, 'checkBid', 'bid: '+coin.bidValue.toFixed(coin.fixed)+' gain: '+gain.toFixed(2)+'% try: '+coin.tryBids);
                            coin.tryBids++;

                        } catch (error) {
                            log(coin, 'error', 'checkBid.depth '+error.message);
                        } finally {
                            setTimeout(checkBid, timeout, coin);
                        }

                    }, depthLimit);

                }
            } catch (error) {
                log(coin, 'error', 'checkBid.orderStatus bid order '+coin.bidOrderId+' error: '+error.message);
                setTimeout(checkBid, timeout, coin);
            }
        });

    } else {

        coin.tryBids = 0;
        coin.bidOpen = false;
        log(coin, 'alert', 'bid does not finished qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed));
    }

}

var canReduceAsk = function (coin, depth) {

    var newAskPrice;
    var newGain = 0.0;
    
    for ( let ask in depth.asks ) {
        newAskPrice = parseFloat(ask);
        newGain = ((newAskPrice / coin.bidValue) - 1) * 100;

        if (newAskPrice < coin.askValue && newGain > coin.minGain) {

            newAskPrice -= coin.price.tickSize;
            if (isValidPrice(coin, newAskPrice)) { 
                coin.askValue = newAskPrice - coin.price.tickSize;
                return true;
            }
        }
    }

    return false;

}

var checkAsk = function (coin) {

    if (!coin.askOpen) { return; }
    
    if (coin.tryAsks <= maxTries) {

        if (coin.done == 0 && coin.tryAsks == maxTries) {
            cancelAsk(coin);
            return;
        }

        var gain = ((coin.askValue / coin.bidValue) - 1) * 100;
        
        binance.orderStatus(coin.symbol, coin.askOrderId, function(json) {

            try {

                if (!json) { throw new Error('Invalid API order status json'); }

                
                if (json.status == 'FILLED') {

                    log(coin, '* SOLD ', 'ask order '+coin.askOrderId+'. qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed)+' gain: '+gain.toFixed(2));
                    coin.tryAsks = 1;
                    coin.askOpen = false;
                    coin.done++;

                } else {

                    if (json.status == 'PARTIALLY_FILLED') {

                        var executedQty = parseFloat(json.executedQty);

                        coin.askQty = coin.askQty - executedQty;
                        if (!isValidQty(coin, coin.askQty)) { 
                            setTimeout(checkAsk, timeout, coin); 
                            return;
                        }
                    } 

                    binance.depth(coin.symbol, function(depth, symbol)  {
                    
                        try {

                            if (!depth) { throw new Error('Invalid API depth'); }
                            if ( typeof depth.asks == "undefined" ) { throw new Error('Invalid API depth'); }

                            if (canReduceAsk(coin, depth)) {

                                binance.cancel(coin.symbol, coin.askOrderId, function(cancel, symbol) {

                                    try {
                                        if (!cancel) { throw new Error('Invalid API cancel response'); }
                                        if ( typeof cancel.msg !== "undefined" ) { throw new Error(cancel.msg); }
                                        if (!isValidNotional(coin, coin.askQty, coin.askValue)) { throw new Error('Invalid ask notional value: '+(coin.askQty*coin.askValue).toFixed(coin.fixed)+' min: '+coin.minNotional.toFixed(coin.fixed)); }
                                        
                                        binance.sell(coin.symbol, coin.askQty.toFixed(2), coin.askValue.toFixed(coin.fixed), {}, function(sell) {

                                            try {
                                                
                                                if (!sell) { throw new Error('Invalid API sell response'); }
                                                if ( typeof sell.msg !== "undefined" ) { throw new Error(sell.msg); }

                                                coin.askOrderId = sell.orderId;
                                                if (coin.askOrderId == 'undefined') { throw new Error('Invalid ask order Id'); }
                                                
                                                coin.askOpen = true;

                                            } catch (error) {
                                                log(coin, 'error', 'checkAsk.sell() qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed)+' error: '+error.message);
                                            }
                                        });

                                    } catch (error) {
                                        log(coin, 'error', 'checkAsk.cancel() ask order '+coin.askOrderId+' qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed)+' error: '+error.message);
                                    }
                                });

                            }
                                
                            log(coin, 'checkAsk', 'ask: '+coin.askValue.toFixed(coin.fixed)+' gain: '+gain.toFixed(2)+'% try: '+coin.tryAsks);
                            coin.tryAsks++;

                        } catch (error) {
                            log(coin, 'error', 'checkAsk.depth '+error.message);
                        } finally {
                            setTimeout(checkAsk, timeout, coin);
                        }

                    }, depthLimit);

                }
            } catch (error) {
                log(coin, 'error', 'checkAsk.orderStatus ask order '+coin.askOrderId+' error: '+error.message);
                setTimeout(checkAsk, timeout, coin);
            }
        });

    } else {

        coin.tryAsks = 1;
        coin.askOpen = false;
        log(coin, 'alert', 'ask does not finished qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed));

    }
}  

var doOrder = function (coin) {


    if (!coin.bidOpen) {

        // Send bid order
        binance.buy(coin.symbol, coin.bidQty.toFixed(2), coin.bidValue.toFixed(coin.fixed), {}, function(response) {
            
            try {
                
                if (!response) { throw new Error('Invalid API buy response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }

                coin.bidOrderId = response.orderId;
                if (coin.bidOrderId == 'undefined') { throw new Error('Invalid bid order Id'); }

                coin.bidOpen = true;
                // log(coin, 'started', 'bid order '+coin.bidOrderId+' qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed));

                checkBid(coin);

            } catch (error) {
                log(coin, 'error', 'doOrder.buy() qty: '+coin.bidQty.toFixed(2)+' value: '+coin.bidValue.toFixed(coin.fixed)+' error: '+error.message);
            }
        });

    }

    if (!coin.askOpen) {

        // Send ask order
        binance.sell(coin.symbol, coin.askQty.toFixed(2), coin.askValue.toFixed(coin.fixed), {}, function(response) {
            
            try {

                if (!response) { throw new Error('Invalid API sell response'); }
                if ( typeof response.msg !== "undefined" ) { throw new Error(response.msg); }
                
                coin.askOrderId = response.orderId;
                if (coin.askOrderId == 'undefined') { throw new Error('Invalid ask order Id'); }

                coin.askOpen = true;
                // log(coin, 'started', 'ask order '+coin.askOrderId+' qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed));

                checkAsk(coin);
                
            } catch (error) {
                log(coin, 'error', 'doOrder.sell() qty: '+coin.askQty.toFixed(2)+' value: '+coin.askValue.toFixed(coin.fixed)+' error: '+error.message);
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
                coin.baseAsset = infoCoin.baseAsset;
                coin.quoteAsset = infoCoin.quoteAsset;

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'PRICE_FILTER';
                })
                var infoPriceFilter = searchFilter[0];
                coin.price.minPrice = parseFloat(infoPriceFilter.minPrice);
                coin.price.maxPrice = parseFloat(infoPriceFilter.maxPrice);
                coin.price.tickSize = parseFloat(infoPriceFilter.tickSize);
                coin.fixed = decimalPlaces(coin.price.tickSize);

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'LOT_SIZE';
                })
                var infoLotFilter = searchFilter[0]
                
                coin.lot.minQty = parseFloat(infoLotFilter.minQty);
                coin.lot.maxQty = parseFloat(infoLotFilter.maxQty);
                coin.lot.stepSize = parseFloat(infoLotFilter.stepSize);
                if (coin.minQty < coin.lot.minQty) { throw new Error('invalid min qty value: '+coin.minQty); }
                if (coin.maxQty > coin.lot.maxQty) { throw new Error('invalid max qty value: '+coin.maxQty); }

                var searchFilter = infoCoin.filters.filter(function(filters) {
                    return filters.filterType == 'MIN_NOTIONAL';
                })
                var infoNotionalFilter = searchFilter[0];

                coin.minNotional = parseFloat(infoNotionalFilter.minNotional);

                if (coin.status == 'TRADING') {
                    coin.init = true;
                } else {
                    throw new Error(' status '+coin.status);
                }
            } catch (error) {
                log(coin, 'error', 'bitbot.exchangeInfo '+error.message);
            } finally {
                setTimeout(bitbot, timeoutCheck, coin);
            }
        });

    } else {

        if (coin.bidOpen || coin.askOpen) {
            setTimeout(bitbot, timeout, coin);
            return;
        }

        // Getting latest price of a symbol
        binance.depth(coin.symbol, function(depth, symbol)  {

            try {

                if (!depth) { throw new Error('Invalid API depth'); }

                var bidPrice = 0.0;
                var askPrice = 0.0;

                // Get bid and ask prices so calculate gain
                var askDepth = 0.0;
                var w1AvgAsk = 0.0;
                var w2AvgAsk = 0.0;

                var fib = [ 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
                var i = 0;

                for ( let ask in depth.asks ) {
                    askDepth = parseFloat(ask);
                    w1AvgAsk += askDepth * fib[i];
                    w2AvgAsk += askDepth * fib[9-i];
                    if (i == 0) { askPrice = askDepth; }
                    i++;
                }
                w1AvgAsk = w1AvgAsk / 231;
                w2AvgAsk = w2AvgAsk / 231;

                i = 0;
                var bidDepth = 0.0;
                var w1AvgBid = 0.0;
                var w2AvgBid = 0.0;

                for ( let bid in depth.bids ) {
                    bidDepth = parseFloat(bid);
                    w1AvgBid += bidDepth * fib[i];
                    w2AvgBid += bidDepth * fib[9-i];
                    if (i == 0) { bidPrice = bidDepth; }
                    i++;
                }
                w1AvgBid = w1AvgBid / 231;
                w2AvgBid = w2AvgBid / 231;
                
                var gain = ((askPrice / bidPrice) - 1) * 100;

                var percW1AvgAsk = ((w1AvgAsk / askPrice) - 1) * 100;
                var percW2AvgAsk = ((w2AvgAsk / askPrice) - 1) * 100;
                var percW1AvgBid = ((bidPrice / w1AvgBid) - 1) * 100;
                var percW2AvgBid = ((bidPrice / w2AvgBid) - 1) * 100;

                log(coin, 'checking', 'bid: '+bidPrice.toFixed(coin.fixed)+' ask: '+askPrice.toFixed(coin.fixed)+
                    ' gain: '+gain.toFixed(2)+((gain < coin.entryGain || gain > coin.maxGain)?'*':'')+
                    ' w1Ask: '+percW1AvgAsk.toFixed(2)+(percW1AvgAsk>coin.avg.w1Ask?'*':'')+
                    ' w2Ask: '+percW2AvgAsk.toFixed(2)+(percW2AvgAsk>coin.avg.w2Ask?'*':'')+
                    ' w1Bid: '+percW1AvgBid.toFixed(2)+(percW1AvgBid>coin.avg.w1Bid?'*':'')+
                    ' w2Bid: '+percW2AvgBid.toFixed(2)+(percW2AvgBid>coin.avg.w2Bid?'*':''));

                if (gain >= coin.entryGain && gain <= coin.maxGain && percW1AvgAsk <= coin.avg.w1Ask && percW2AvgAsk <= coin.avg.w2Ask && percW1AvgBid <= coin.avg.w1Bid && percW2AvgBid <= coin.avg.w2Bid ) {

                    coin.done = 0;
                    var quantity = generateQuantity(coin);

                    binance.balance(function(balances) {

                        try {
        
                            var cryptoCoin = coin.baseAsset;
                            var cryptoBalance = 0.0;

                            if (cryptoCoin == 'BTC') {
                                cryptoBalance = parseFloat(balances.BTC.available); 
                            } else if (cryptoCoin == 'BNB') {
                                cryptoBalance = parseFloat(balances.BNB.available); 
                            } else if (cryptoCoin == 'ETH') {
                                cryptoBalance = parseFloat(balances.ETH.available); 
                            } else if (cryptoCoin == 'LTC') {
                                cryptoBalance = parseFloat(balances.LTC.available); 
                            } else if (cryptoCoin == 'NEO') {
                                cryptoBalance = parseFloat(balances.NEO.available); 
                            } 
                            var usdtBalance = parseFloat(balances.USDT.available);

                            if (cryptoBalance>quantity && usdtBalance>quantity*bidPrice) {
                                coin.bidQty = quantity;
                                coin.askQty = quantity;
                                coin.tryAsks = 1;
                                coin.tryBids = 1;
                
                                log(coin, 'starting', 'bid: '+bidPrice.toFixed(coin.fixed)+' ask: '+askPrice.toFixed(coin.fixed)+
                                    ' qty: '+quantity.toFixed(2)+' gain: '+gain.toFixed(2)+'%');
                                
                                coin.bidValue = bidPrice + coin.price.tickSize;
                                coin.askValue = askPrice - coin.price.tickSize;
                
                                if (!isValidPrice(coin, coin.bidValue)) { throw new Error('Invalid bid price value: '+coin.bidValue.toFixed(coin.fixed)); }
                                if (!isValidPrice(coin, coin.askValue)) { throw new Error('Invalid ask price value: '+coin.askValue.toFixed(coin.fixed)); }
                                if (!isValidNotional(coin, coin.bidQty, coin.bidValue)) { throw new Error('Invalid bid notional value: '+(coin.bidQty*coin.bidValue).toFixed(coin.fixed)+' min: '+coin.minNotional.toFixed(coin.fixed)); }
                                if (!isValidNotional(coin, coin.askQty, coin.askValue)) { throw new Error('Invalid ask notional value: '+(coin.askQty*coin.askValue).toFixed(coin.fixed)+' min: '+coin.minNotional.toFixed(coin.fixed)); }

                                doOrder(coin);

                            } else {
                                throw new Error('Account has insufficient balance for requested action.')
                            }

                        } catch (error) {
                            log(coin, 'error', 'binance.balance error: '+error.message);
                        }
                    });

                } 
            } catch (error) {
                log(coin, 'error', 'bitbot.depth error: '+error.message);
            } finally {
                setTimeout(bitbot, timeoutCheck, coin);
            }
        }, depthLimit);
    }
}

console.log('Initializing BitBot...');

// bitbot(BNBUSDT)
// bitbot(LTCBNB);
// bitbot(BTCUSDT);
// bitbot(BTCUSDT);
bitbot(BNBBTC);


