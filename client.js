/**
 * Module dependencies.
 */

var express = require('express')
  , Step = require("step")
  , wf = require("webfinger")
  , http = require('http')
  , https = require('https')
  , url = require('url')
  , querystring = require('querystring')
  , path = require('path');

var app = express();

var port = process.env.PORT || 3001;

app.configure(function(){
  app.set('port', port);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.get("/.well-known/host-meta.json", function(req, res) {
    res.json({
        links: [
            {
                rel: "lrdd",
                type: "application/json",
                template: "http://localhost:"+port+"/lrdd.json?uri={uri}"
            },
            {
                rel: "dialback",
                href: "http://localhost:"+port+"/dialback"
            }
        ]
    });
});

app.get("/lrdd.json", function(req, res) {
    var uri = req.query.uri,
        parts = uri.split("@"),
        username = parts[0],
        hostname = parts[1];

    res.json({
        links: [
            {
                rel: "dialback",
                href: "http://localhost:"+port+"/dialback"
            }
        ]
    });
});

var requests = {
};

app.post('/dialback', function(req, res, next) {

});

app.get("/", function(req, res, next) {
    res.send("<html>" + 
             "<head>" +
             "<title>Add two numbers</title>" +
             "</head>" +
             "<body>" +
             "<h1>Add two numbers</h1>" +
             "<form>" +
             "<input type='text' name='augend' size='3'/> + " +
             "<input type='text' name='addend' size='3'/> = " +
             "<input type='text' name='result' size='3'/>" +
             "<input type='submit' />" +
             "</form>" +
             "</body>" +
             "</html>");
});

app.post("/", function(req, res, next) {
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
