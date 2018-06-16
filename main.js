'use strict';

var config = require('./config');
const binance = require('node-binance-api');
binance.options({
  'APIKEY': config.apiKey,
  'APISECRET': config.secretKey
});


var bidOpen = false;
var askOpen = false;
var bidValue;
var askValue;
var waitAsk = false;
var waitBid = false;
var cancel = false;

var bidOrderId;
var askOrderId;

var bids = 0;
var maxBids = 30;
var asks = 0;
var maxAsks = 30;

// BNBUSDT
var coin = 'BNBUSDT';
var minQty = 10.00; // Can not be less than one because API returns 'Order quantity '
var maxQty = 15.00;
var maxGain = 0.6;
var minGain = 0.5;
var bidQty = 0.0;
var askQty = 0.0;
var quantity = 1.0;
var fixed = 4;
var variation = 0.0001;

// BNBBTC
// var coin = 'BNBBTC';
// var minQty = 2.00; // Can not be less than one because API returns 'Order quantity '
// var maxQty = 4.00;
// var maxGain = 0.4;
// var minGain = 0.3;
// var bidQty = 0.0;
// var askQty = 0.0;
// var quantity = 1.0;
// var fixed = 7;
// var variation = 0.0000001;

var generateQuantity = function () {
    return parseFloat((Math.random() * (maxQty - minQty) + minQty).toFixed(2));
}

var log = function (type, message) {
    var now = new Date();
    console.log(now.toLocaleString()+' ('+type+') '+message);
}

var cancelBidOrder = function(bidOrderId, quantity, value) {

    try {
        binance.cancel(coin, bidOrderId, function(response, symbol) {
            log('started', 'bid order '+bidOrderId+' cancelled. quantity: '+quantity.toFixed(2)+' value: '+value.toFixed(fixed));
            bidOpen = false;
        });
    } catch (error) {
        log('critical', 'bitbot.cancel() bid order '+bidOrderId+' quantity: '+quantity.toFixed(2)+' value: '+value.toFixed(fixed)+' error: '+error.message);
    }

}

var cancelAskOrder = function(askOrderId, quantity, value) {
    
    try {
        binance.cancel(coin, askOrderId, function(response, symbol) {
            log('started', 'ask order '+askOrderId+' cancelled. quantity: '+quantity.toFixed(2)+' value: '+value.toFixed(fixed));
            askOpen = false;
        });
    } catch (error) {
        log('critical', 'bitbot.cancel() ask order '+askOrderId+' quantity: '+quantity.toFixed(2)+' value: '+value.toFixed(fixed)+' error: '+error.message);
    }

}

var checkBidOrder = function () {

    if (bids < maxBids) {

        log('buying', 'quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));
        bids++;

        binance.orderStatus(coin, bidOrderId, function(json) {

            try {
                
                if (!json) { throw 'Invalid API orderStatus() json'; }
                
                var executedQty = parseFloat(json.executedQty);

                if (json.status == 'FILLED' && executedQty.toFixed(2) == bidQty.toFixed(2)) {

                    bidOpen = false;
                    waitAsk = false;
                    log('bought', 'bid order '+bidOrderId+' confirmed. quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));
                    console.log(json);

                } else {

                    try {

                        binance.bookTicker(coin, function(ticker) {

                            var newBidPrice = parseFloat(ticker.bidPrice);

                            // If exists a new bid better than mine
                            if (newBidPrice > bidValue) {

                                var gain = ((askValue / newBidPrice) - 1) * 100;

                                if (gain > minGain) {
                                
                                    try {
                                        
                                        binance.cancel(coin, bidOrderId, function(response, symbol) {

                                            if (!response) { throw 'Invalid API cancel() response'; }

                                            log('trading', 'bid order '+bidOrderId+' cancelled. quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));

                                            if (json.status == 'PARTIALLY_FILLED') { bidQty = bidQty - executedQty; }
                                            bidValue = newBidPrice + variation;
                                            
                                            try {

                                                binance.buy(coin, bidQty.toFixed(2), bidValue.toFixed(fixed), {}, function(response) {

                                                    if (!response) { throw 'Invalid API buy() response'; }
                                                    
                                                    bidOrderId = response.orderId;
                                                    if (bidOrderId == 'undefined') { throw 'Invalid bid order Id'; }
                                                    
                                                    bidOpen = true;
                                                    log('trading', 'bid order '+bidOrderId+' redone. quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));
                                                });
                                            } catch (error) {
                                                log('error', 'checkBidOrder.buy(). quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed)+' error: '+error.message);
                                            }
                                        });
                                    } catch (error) {
                                        log('error', 'checkBidOrder.cancel() bid order '+bidOrderId+' quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed)+' error: '+error.message);
                                    }
                                }
                            }
                        });

                    } catch (error) {
                        log('error', 'checkBidOrder.bookTicker()  error: '+error.message);
                    } finally {
                        setTimeout(checkBidOrder, 5000);
                    }

                }
            } catch (error) {
                log('error', 'checkBidOrder.orderStatus() coin:'+coin+' bid order '+bidOrderId+' error: '+error.message);
                setTimeout(checkBidOrder, 5000);
            }
        });

    } else {

        cancelBidOrder(bidOrderId, bidQty, bidValue);
        bids = 0;

    }

}

var checkAskOrder = function () {

    if (asks < maxAsks) {
        
        log('selling', 'quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));
        asks++;
        
        binance.orderStatus(coin, askOrderId, function(json) {

            try {

                if (!json) { throw 'Invalid API orderStatus() json'; }

                var executedQty = parseFloat(json.executedQty);
                
                if (json.status == 'FILLED' && executedQty.toFixed(2) == askQty.toFixed(2)) {

                    askOpen = false;
                    waitBid = false;
                    log('sold', 'ask order '+askOrderId+' confirmed. quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));
                    console.log(json);

                } else {

                    try {

                        binance.bookTicker(coin, function(ticker) {
                            
                            var newAskPrice = parseFloat(ticker.askPrice);

                            // If exists a new ask better than mine
                            if (newAskPrice < askValue) {

                                var gain = ((newAskPrice / bidValue) - 1) * 100;

                                if (gain > minGain) {

                                    try {

                                        binance.cancel(coin, askOrderId, function(response, symbol) {

                                            if (!response) { throw 'Invalid API cancel() response'; }

                                            log('trading', 'ask order '+askOrderId+' cancelled. quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));

                                            if (json.status == 'PARTIALLY_FILLED') { askQty = askQty - executedQty; }
                                            askValue = newAskPrice - variation;
                                            
                                            try {
                                                binance.sell(coin, askQty, askValue.toFixed(fixed), {}, function(response) {

                                                    if (!response) { throw 'Invalid API sell() response'; }
                                                    // if (response.code == -2010) {throw 'Balance insufficient'; }

                                                    askOrderId = response.orderId;
                                                    if (askOrderId == 'undefined') { throw 'Invalid ask order Id'; }
                                                    
                                                    askOpen = true;
                                                    log('trading', 'ask order '+askOrderId+' redone. quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));
                                                });
                                            } catch (error) {
                                                log('error', 'checkAskOrder.sell(). quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed)+' error: '+error.message);
                                            }

                                        });
                                    } catch (error) {
                                        log('error', 'checkAskOrder.cancel() ask order '+askOrderId+' quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed)+' error: '+error.message);
                                    }
                                }
                            }
                        });                
                    } catch (error) {
                        log('error', 'checkAskOrder.bookTicker()  error: '+error.message);
                    } finally {
                        setTimeout(checkAskOrder, 5000);
                    }
                }
            } catch (error) {
                log('error', 'checkAskOrder.orderStatus() coin:'+coin+' ask order '+askOrderId+' error: '+error.message);
                setTimeout(checkAskOrder, 5000);
            }
        });

    } else {

        if (!bidOpen) { 
            cancelAskOrder(askOrderId, askQty, askValue); 
        }
        asks = 0;

    }
}


var forceBid = function(newBidValue) {

    try {
        
        binance.cancel(coin, bidOrderId, function(response, symbol) {

            if (!response) { throw 'Invalid API cancel() response'; }

            log('trading', 'bid order '+bidOrderId+' cancelled. quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));

            try {

                bidValue = newBidValue;

                binance.buy(coin, bidQty.toFixed(2), bidValue.toFixed(fixed), {}, function(response) {

                    if (!response) { throw 'Invalid API buy() response'; }
                    
                    bidOrderId = response.orderId;
                    if (bidOrderId == 'undefined') { throw 'Invalid bid order Id'; }
                    
                    bidOpen = true;
                    log('trading', 'bid order '+bidOrderId+' redone. quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));
                });
            } catch (error) {
                log('error', 'checkBidOrder.buy(). quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed)+' error: '+error.message);
            }
        });
    } catch (error) {
        log('error', 'checkBidOrder.cancel() bid order '+bidOrderId+' quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed)+' error: '+error.message);
    }

}

var forceAsk = function (newAskValue) {
    try {
        
        binance.cancel(coin, askOrderId, function(response, symbol) {

            if (!response) { throw 'Invalid API cancel() response'; }

            log('trading', 'ask order '+askOrderId+' cancelled. quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));

            try {

                askValue = newAskValue;

                binance.sell(coin, askQty, askValue.toFixed(fixed), {}, function(response) {

                    if (!response) { throw 'Invalid API sell() response'; }
                    if ( typeof response.msg !== "undefined" && response.code == -2010) { throw 'Balance insufficient'; }
                    
                    askOrderId = response.orderId;
                    if (askOrderId == 'undefined') { throw 'Invalid ask order Id'; }
                    
                    log('trading', 'ask order '+askOrderId+' redone. quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));
                });
            } catch (error) {
                log('error', 'forceAsk.sell(). quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed)+' error: '+error.message);
            }

        });
    } catch (error) {
        log('error', 'forceAsk.cancel() ask order '+askOrderId+' quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed)+' error: '+error.message);
    }    
}

var doBid = function() {

    if (waitAsk) { 

        setTimeout(doBid, 5000); 

    } else {

        // Send bid order
        binance.buy(coin, bidQty.toFixed(2), bidValue.toFixed(fixed), {}, function(response) {
            
            try {
                
                if (!response) { throw 'Invalid API buy() response'; }
                if ( typeof response.msg !== "undefined" && response.code == -2010) { throw 'Balance insufficient'; }

                bidOrderId = response.orderId;
                if (bidOrderId == 'undefined') { throw 'Invalid bid order Id'; }

                bidOpen = true;
                log('started', 'bid order '+bidOrderId+' quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed));

            } catch (error) {
                log('error', 'bitbot.buy(). quantity: '+bidQty.toFixed(2)+' value: '+bidValue.toFixed(fixed)+' error: '+error.message);
            }
        });

        checkBidOrder();
    }
    
}

var doAsk = function() {

    if (waitBid) {

        setTimeout(doAsk, 5000);

    } else {



        // Send ask order
        binance.sell(coin, askQty.toFixed(2), askValue.toFixed(fixed), {}, function(response) {
            
            try {

                if (!response) { throw 'Invalid API sell() response'; }
                if ( typeof response.msg !== "undefined" && response.code == -2010) { throw new Error('Balance insufficient'); }
                
                askOrderId = response.orderId;
                if (askOrderId == 'undefined') { throw new Error('Invalid ask order Id'); }

                askOpen = true;
                log('started', 'ask order '+askOrderId+' quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed));

                checkAskOrder();
                
            } catch (error) {
                // Cancel bid order if ask order fails
                log('error', 'bitbot.sell(). quantity: '+askQty.toFixed(2)+' value: '+askValue.toFixed(fixed)+' error: '+error.message);
            }
        });
    }

}

var bitbot = function () {

    try {

        if (bidOpen || askOpen) { 
            
            if (tries < maxTries) {
                tries++;

                if (tries == (maxTries*2/3)) {
                    
                    binance.price(coin, function(ticker) {
                        
                        try {
                            var price = parseFloat(ticker.price);

                            if (bidOpen && askOpen) {
                                forceBid(price*(1-(minGain/2/100)));
                                forceAsk(price*(1+(minGain/2/100)));
                            } else if (bidOpen) {
                                forceBid(askValue*(1-(minGain/100)));
                            } else {
                                forceAsk(bidValue*(1+(minGain/100)));
                            }

                        } catch (error) {
                            log('error', 'bitbot.price() try error: '+error.message);
                        }
                    });
                }

                return; 
            } else {

                tries = 0;
                log('alert', 'bid'+(bidOpen?'-open':'-done')+': '+bidValue.toFixed(fixed)+
                ' ask'+(askOpen?'-open':'-done')+': '+askValue.toFixed(fixed)+
                ' diff: '+(((askValue/bidValue)-1)*100).toFixed(2)+'%');

                if (bidOpen && askOpen) {
                    cancelBidOrder(bidOrderId, bidQty, bidValue);
                    cancelAskOrder(askOrderId, askQty, askValue);
                }

                bidOpen = false;
                askOpen = false;
            }
        }
    
        // Getting latest price of a symbol
        binance.bookTicker(coin, function(ticker) {

            try {

                var bidPrice = parseFloat(ticker.bidPrice);
                var askPrice = parseFloat(ticker.askPrice);
                var gain = ((askPrice / bidPrice) - 1) * 100;
            
                log('checking', 'bid: '+bidPrice.toFixed(fixed)+' ask: '+askPrice.toFixed(fixed)+' diff: '+gain.toFixed(2)+'%');

                if (gain > maxGain) {

                    quantity = generateQuantity();
                    bidQty = quantity;
                    askQty = quantity;
                    tries = 0;

                    log('starting', 'bid:'+bidPrice.toFixed(fixed)+' ask: '+askPrice.toFixed(fixed)+' gain: '+gain.toFixed(2)+'% quantity: '+quantity.toFixed(2));
                    
                    bidValue = bidPrice + variation;
                    askValue = askPrice - variation;

                    binance.price(coin, function(ticker) {
                        
                        try {
                            var price = parseFloat(ticker.price);

                            var diffBid = price-bidValue;
                            if (diffBid < 0) { diffBid = 0; }

                            var diffAsk = askValue-price;
                            if (diffAsk < 0) { diffAsk = 0; }

                            if (diffBid > diffAsk) {

                                waitBid = false;
                                waitAsk = true;

                                // do Bid first
                                doBid();
                                doAsk();

                            } else {

                                // do Ask first
                                waitAsk = false;
                                waitBid = true;

                                doAsk();
                                doBid();

                            }

                        } catch (error) {
                            log('error', 'bitbot.price() error: '+error.message);
                        }
                    });
                } 
            } catch (error) {
                log('error', 'bitbot.bookTicker() error: '+error.message);
            }
        });
    } catch (error) {
        log('error', 'bitbot error: '+error.message);
    } finally {
        setTimeout(bitbot, 5000);
    }
}

console.log('Initializing BitBot...');
console.log('Coin: '+coin);
console.log('Minimum quantity: '+minQty.toFixed(2));
console.log('Maximum quantity: '+maxQty.toFixed(2));
console.log('Max gain: '+maxGain.toFixed(1));
console.log('Min gain: '+minGain.toFixed(1));

bitbot();


