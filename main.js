
var mongoose = require('mongoose');

var config = require('./config');

mongoose.connect(config.mongoUrl);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    // we're connected!
    console.log("Connected correctly to server");
});

var Ticker = require('./models/ticker');

Ticker.remove({}, function (err, resp) {
    if (err) throw err;
    console.log(resp);
});

var https = require('https');

var options = {
    host: 'api.binance.com',
    path: '/api/v3/ticker/price?symbol=BNBUSDT',
    method: 'GET',
    headers: {'User-Agent': 'request'}
};

var recursiva = function () {
    
    https.get(options, function (res) {
        var json = '';
        res.on('data', function (chunk) {
            json += chunk;
        });
        res.on('end', function () {
            if (res.statusCode === 200) {
                try {
                    var data = JSON.parse(json);
    
                    var newTicker = Ticker({
                        symbol: 'BNBUSDT',
                        price: data["price"]
                    });

                    newTicker.save(function (err) {
                        if (err) throw err;

                        var now = new Date();
                        
                        // console.log(now + ' Ticker created: ' + data["price"]);
                        console.log(data["price"]);

                        /*
                        Ticker.find({}).sort({"_id": -1}).limit(3).exec(function (err, ticker) {
                            if (err) throw err;

                            console.log(ticker);
                        });
                        */

                    });
                        
                } catch (e) {
                    console.log('Error parsing JSON!');
                }
            } else {
                console.log('Status:', res.statusCode);
            }
        });
    }).on('error', function (err) {
          console.log('Error:', err);
    });

    setTimeout(recursiva, 10000);
}

recursiva();


