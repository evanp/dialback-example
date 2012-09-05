/**
 * Module dependencies.
 */

var express = require('express'),
    Step = require("step"),
    wf = require("webfinger"),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring'),
    path = require('path'),
    config = require("./config");

var app = express();

var discoverHostEndpoint = function(host, callback) {

    Step(
        function() {
            wf.hostmeta(host, this);
        },
        function(err, jrd) {
            var dialbacks;
            if (err) {
                callback(err, null);
                return;
            }
            if (!jrd.hasOwnProperty("links")) {
                callback(new Error("No links in host-meta for " + host), null);
                return;
            }
            dialbacks = jrd.links.filter(function(link) {
                return (link.hasOwnProperty("rel") && link.rel == "dialback" && link.hasOwnProperty("href"));
            });
            if (dialbacks.length === 0) {
                callback(new Error("No dialback links in host-meta for " + host), null);
                return;
            }
            callback(null, dialbacks[0].href);
        }
    );

};

var discoverWebfingerEndpoint = function(address, callback) {

    Step(
        function() {
            wf.hostmeta(address, this);
        },
        function(err, jrd) {
            var dialbacks;
            if (err) {
                callback(err, null);
                return;
            }
            if (!jrd.hasOwnProperty("links")) {
                callback(new Error("No links in lrdd for " + address), null);
                return;
            }
            dialbacks = jrd.links.filter(function(link) {
                return (link.hasOwnProperty("rel") && link.rel == "dialback");
            });
            if (dialbacks.length === 0) {
                callback(new Error("No dialback links in lrdd for " + address), null);
                return;
            }
            callback(null, dialbacks[0]);
        }
    );
};

var discoverEndpoint = function(fields, callback) {
    if (fields.hasOwnProperty("host")) {
        discoverHostEndpoint(fields.host, callback);
    } else if (fields.hasOwnProperty("webfinger")) {
        discoverWebfingerEndpoint(fields.webfinger, callback);
    }
};

var postToEndpoint = function(endpoint, params, callback) {
    var options = url.parse(endpoint);
    options.method = "POST";

    var mod = (options.protocol == "https://") ? https : http;

    var req = mod.request(options, function(res) {
        var body = "";
        res.setEncoding("utf8");
        res.on("data", function(chunk) {
            body = body + chunk;
        });
        res.on("error", function(err) {
            callback(err, null, null);
        });
        res.on("end", function() {
            if (res.statusCode < 200 || res.statusCode > 300) {
                callback(new Error("Error " + res.statusCode + ": " + body), null, null);
            } else {
                callback(null, body, res);
            }
        });
    });

    req.on("error", function(err) {
        callback(err, null, null);
    });

    req.write(querystring.stringify(params));

    req.end();
};

var dialback = function(req, res, next) {

    var auth,
        fields,
        unauthorized = function() {
            res.status(401);
            res.set({
                "WWW-Authentication": "Dialback",
                "Content-Type": "text/plain"
            });
            res.send("Unauthorized");
        },
        parseFields = function(str) {
            var fstr = str.substr(9); // everything after "Dialback "
            var pairs = fstr.split(/\s+/); // XXX: won't handle blanks inside values well
            var fields = {};
            pairs.forEach(function(pair) {
                var kv = pair.split("="),
                    key = kv[0],
                    value = kv[1].replace(/^"|"$/g, "");
                fields[key] = value;
            });
            return fields;
        };

    if (!req.headers.hasOwnProperty("authorization")) {
        unauthorized();
        return;
    }

    auth = req.headers.authorization;

    if (auth.substr(0, 9) != "Dialback ") {
        unauthorized();
        return;
    }

    fields = parseFields(auth);

    // must have a nonce

    if (!fields.hasOwnProperty("nonce")) {
        unauthorized();
        return;
    }

    // must have a webfinger or host field

    if (!fields.hasOwnProperty("host") && !fields.hasOwnProperty("webfinger")) {
        unauthorized();
        return;
    }

    fields.url = req.originalUrl;
    
    if (req.headers.hasOwnProperty("date")) {
        fields.date = req.headers.date;
    }

    Step(
        function() {
            discoverEndpoint(fields, this);
        },
        function(err, endpoint) {
            if (err) throw err;
            postToEndpoint(endpoint, fields, this);
        },
        function(err, res) {
            if (err) {
                next(err);
            } else if (res.statusCode !== 200) {
                unauthorized();
            } else if (fields.hasOwnProperty("host")) {
                req.host = fields.host;
                next();
            } else if (fields.hasOwnProperty("webfinger")) {
                req.webfinger = fields.webfinger;
                next();
            }
        }
    );
};

app.configure(function(){
  app.set('port', 80);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

/**
 * Add two numbers and return the result
 */

var add = function(req, res, next) {
    var augend, addend;

    try {
        augend = parseInt(req.body.augend, 10);
        addend = parseInt(req.body.addend, 10);
        res.send(augend + addend);
    } catch (err) {
        next(err);
    }
};

app.post('/add', dialback, add);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
